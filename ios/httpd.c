#include "httpd.h"

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <strings.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[1024];

static int hex_nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

/* Decode the path portion of a request target into out. Rejects '..' . */
static int clean_path(const char *target, char *out, size_t out_len) {
  const char *q = strchr(target, '?');
  size_t n = q ? (size_t)(q - target) : strlen(target);
  char decoded[1024];
  size_t w = 0;
  if (n == 0 || target[0] != '/' || n >= sizeof(decoded)) return -1;
  for (size_t i = 0; i < n; i++) {
    unsigned char c = (unsigned char)target[i];
    if (c == '%') {
      if (i + 2 >= n) return -1;
      int hi = hex_nibble(target[i + 1]);
      int lo = hex_nibble(target[i + 2]);
      if (hi < 0 || lo < 0) return -1;
      c = (unsigned char)((hi << 4) | lo);
      i += 2;
    }
    if (c == '\\' || c == '\0') return -1;
    decoded[w++] = (char)c;
  }
  decoded[w] = '\0';

  char clean[1024];
  size_t cw = 0;
  clean[cw++] = '/';
  char *save = NULL;
  char *seg = strtok_r(decoded, "/", &save);
  while (seg) {
    if (strcmp(seg, ".") == 0 || strcmp(seg, "..") == 0 || seg[0] == '\0') return -1;
    size_t sl = strlen(seg);
    if (cw + 1 + sl >= sizeof(clean)) return -1;
    if (cw > 1) clean[cw++] = '/';
    memcpy(clean + cw, seg, sl);
    cw += sl;
    seg = strtok_r(NULL, "/", &save);
  }
  clean[cw] = '\0';
  if (strlen(clean) + 1 > out_len) return -1;
  memcpy(out, clean, cw + 1);
  return 0;
}

static const char *mime_of(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) return "application/octet-stream";
  if (!strcasecmp(dot, ".html")) return "text/html; charset=utf-8";
  if (!strcasecmp(dot, ".js")) return "text/javascript; charset=utf-8";
  if (!strcasecmp(dot, ".css")) return "text/css; charset=utf-8";
  if (!strcasecmp(dot, ".json")) return "application/json";
  if (!strcasecmp(dot, ".wasm")) return "application/wasm";
  if (!strcasecmp(dot, ".svg")) return "image/svg+xml";
  if (!strcasecmp(dot, ".png")) return "image/png";
  if (!strcasecmp(dot, ".txt") || !strcasecmp(dot, ".md")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

static void send_all(int fd, const char *data, size_t len) {
  size_t off = 0;
  while (off < len) {
#ifdef MSG_NOSIGNAL
    ssize_t n = send(fd, data + off, len - off, MSG_NOSIGNAL);
#else
    ssize_t n = send(fd, data + off, len - off, 0);
#endif
    if (n < 0) {
      if (errno == EINTR) continue;
      return;
    }
    if (n == 0) return;
    off += (size_t)n;
  }
}

static void reply_text(int fd, int code, const char *text) {
  char header[256];
  int n = snprintf(header, sizeof(header),
                   "HTTP/1.1 %d %s\r\nContent-Type: text/plain; charset=utf-8\r\n"
                   "Content-Length: %zu\r\nConnection: close\r\n\r\n",
                   code, code == 404 ? "Not Found" : "Bad Request", strlen(text));
  if (n > 0) send_all(fd, header, (size_t)n);
  send_all(fd, text, strlen(text));
}

static void serve_file(int fd, const char *full) {
  FILE *f = fopen(full, "rb");
  if (!f) {
    reply_text(fd, 404, "not found\n");
    return;
  }
  if (fseek(f, 0, SEEK_END) != 0) {
    fclose(f);
    reply_text(fd, 404, "not found\n");
    return;
  }
  long size = ftell(f);
  if (size < 0) {
    fclose(f);
    reply_text(fd, 404, "not found\n");
    return;
  }
  rewind(f);
  char header[512];
  int hn = snprintf(header, sizeof(header),
                    "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %ld\r\n"
                    "Connection: close\r\nCache-Control: no-cache\r\n\r\n",
                    mime_of(full), size);
  if (hn > 0) send_all(fd, header, (size_t)hn);
  char buf[65536];
  size_t left = (size_t)size;
  while (left) {
    size_t chunk = left > sizeof(buf) ? sizeof(buf) : left;
    size_t got = fread(buf, 1, chunk, f);
    if (got == 0) break;
    send_all(fd, buf, got);
    left -= got;
  }
  fclose(f);
}

static void handle_client(int fd) {
  char req[8192];
  size_t used = 0;
  while (used + 1 < sizeof(req)) {
    ssize_t n = recv(fd, req + used, sizeof(req) - 1 - used, 0);
    if (n < 0) {
      if (errno == EINTR) continue;
      close(fd);
      return;
    }
    if (n == 0) break;
    used += (size_t)n;
    req[used] = '\0';
    if (strstr(req, "\r\n\r\n")) break;
  }
  req[used] = '\0';
  char method[8];
  char target[1024];
  if (sscanf(req, "%7s %1023s", method, target) != 2 || strcmp(method, "GET") != 0) {
    reply_text(fd, 400, "bad request\n");
    close(fd);
    return;
  }
  char rel[1024];
  if (clean_path(target, rel, sizeof(rel)) != 0) {
    reply_text(fd, 400, "bad path\n");
    close(fd);
    return;
  }
  char full[1600];
  int wrote = snprintf(full, sizeof(full), "%s%s", g_root, rel);
  if (wrote < 0 || (size_t)wrote >= sizeof(full)) {
    reply_text(fd, 400, "bad path\n");
    close(fd);
    return;
  }
  struct stat st;
  if (stat(full, &st) == 0 && S_ISDIR(st.st_mode)) {
    size_t len = strlen(full);
    if (len + strlen("/index.html") >= sizeof(full)) {
      reply_text(fd, 404, "not found\n");
      close(fd);
      return;
    }
    memcpy(full + len, "/index.html", strlen("/index.html") + 1);
  }
  if (strncmp(full, g_root, strlen(g_root)) != 0) {
    reply_text(fd, 400, "bad path\n");
    close(fd);
    return;
  }
  serve_file(fd, full);
  close(fd);
}

static void *client_thread(void *arg) {
  int fd = (int)(intptr_t)arg;
  handle_client(fd);
  return NULL;
}

static void *accept_thread(void *arg) {
  int server = (int)(intptr_t)arg;
  for (;;) {
    int fd = accept(server, NULL, NULL);
    if (fd < 0) {
      if (errno == EINTR) continue;
      break;
    }
#ifdef SO_NOSIGPIPE
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof(one));
#endif
    pthread_t th;
    if (pthread_create(&th, NULL, client_thread, (void *)(intptr_t)fd) != 0) {
      close(fd);
      continue;
    }
    pthread_detach(th);
  }
  return NULL;
}

int httpd_start(const char *root, int *port) {
  if (!root || !port || strlen(root) == 0 || strlen(root) >= sizeof(g_root)) return -1;
  signal(SIGPIPE, SIG_IGN);
  memcpy(g_root, root, strlen(root) + 1);
  while (strlen(g_root) > 1 && g_root[strlen(g_root) - 1] == '/') g_root[strlen(g_root) - 1] = '\0';

  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return -1;
  int yes = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = htons(0);
  if (bind(server, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    close(server);
    return -1;
  }
  socklen_t alen = sizeof(addr);
  if (getsockname(server, (struct sockaddr *)&addr, &alen) != 0) {
    close(server);
    return -1;
  }
  if (listen(server, 32) != 0) {
    close(server);
    return -1;
  }
  *port = ntohs(addr.sin_port);
  pthread_t th;
  if (pthread_create(&th, NULL, accept_thread, (void *)(intptr_t)server) != 0) {
    close(server);
    return -1;
  }
  pthread_detach(th);
  return 0;
}

#ifdef HTTPD_MAIN
int main(int argc, char **argv) {
  const char *root = argc > 1 ? argv[1] : ".";
  int port = 0;
  if (httpd_start(root, &port) != 0) return 1;
  printf("%d\n", port);
  fflush(stdout);
  for (;;) pause();
}
#endif
