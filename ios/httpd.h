#pragma once

/* Serves files from root on 127.0.0.1. Writes the chosen port to *port.
   Returns 0 on success. The accept loop runs on a background thread. */
int httpd_start(const char *root, int *port);
