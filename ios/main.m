#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

#import "httpd.h"

@interface SaverController : UIViewController <WKUIDelegate, WKNavigationDelegate>
@end

@implementation SaverController {
  WKWebView *_web;
  UILabel *_error;
}

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor colorWithRed:0.078 green:0.082 blue:0.110 alpha:1];

  NSString *root = [[[NSBundle mainBundle] bundlePath] stringByAppendingPathComponent:@"www"];
  int port = 0;
  if (httpd_start(root.fileSystemRepresentation, &port) != 0) {
    [self showMessage:@"本机页面没有启动。"];
    return;
  }

  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  config.allowsInlineMediaPlayback = YES;
  config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;

  _web = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
  _web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  _web.opaque = NO;
  _web.backgroundColor = [UIColor clearColor];
  _web.scrollView.bounces = NO;
  if (@available(iOS 11.0, *)) {
    _web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
  }
  _web.UIDelegate = self;
  _web.navigationDelegate = self;
  [self.view addSubview:_web];

  NSString *urlString = [NSString stringWithFormat:@"http://127.0.0.1:%d/?app=1", port];
  NSURL *url = [NSURL URLWithString:urlString];
  [_web loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)showMessage:(NSString *)text {
  if (_error) return;
  _error = [[UILabel alloc] initWithFrame:CGRectInset(self.view.bounds, 28, 28)];
  _error.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  _error.textColor = [UIColor whiteColor];
  _error.font = [UIFont systemFontOfSize:17 weight:UIFontWeightMedium];
  _error.textAlignment = NSTextAlignmentCenter;
  _error.numberOfLines = 0;
  _error.text = text;
  [self.view addSubview:_error];
}

- (BOOL)prefersStatusBarHidden {
  return YES;
}

- (BOOL)prefersHomeIndicatorAutoHidden {
  return YES;
}

- (UIRectEdge)preferredScreenEdgesDeferringSystemGestures {
  return UIRectEdgeBottom;
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self showMessage:error.localizedDescription];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self showMessage:error.localizedDescription];
}

- (void)webView:(WKWebView *)webView
    requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
                          initiatedByFrame:(WKFrameInfo *)frame
                                      type:(WKMediaCaptureType)type
                           decisionHandler:(void (^)(WKPermissionDecision))decisionHandler API_AVAILABLE(ios(15.0)) {
  decisionHandler(WKPermissionDecisionGrant);
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  application.idleTimerDisabled = YES;
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.backgroundColor = [UIColor colorWithRed:0.078 green:0.082 blue:0.110 alpha:1];
  self.window.rootViewController = [SaverController new];
  [self.window makeKeyAndVisible];
  return YES;
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
  application.idleTimerDisabled = YES;
}

@end

int main(int argc, char *argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
  }
}
