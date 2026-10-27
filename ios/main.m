#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

#import "httpd.h"

@interface SaverController : UIViewController <WKUIDelegate, WKNavigationDelegate>
@end

@implementation SaverController {
  WKWebView *_web;
  UILabel *_error;
  NSInteger _hingeStatus;
  CGFloat _hingeAngle;
  BOOL _hingeSeen;
}

- (void)pushDuo {
  if (!_web) return;
  NSString *status = @"none";
  if (_hingeSeen) {
    switch (_hingeStatus) {
      case 1: status = @"closed"; break;
      case 2: status = @"partial"; break;
      case 3: status = @"open"; break;
      default: status = @"unknown"; break;
    }
  }
  UIWindowScene *scene = self.view.window.windowScene;
  BOOL landscape = NO;
  if (scene) {
    if (@available(iOS 26.0, *)) {
      landscape = UIInterfaceOrientationIsLandscape(scene.effectiveGeometry.interfaceOrientation);
    } else {
      landscape = UIInterfaceOrientationIsLandscape(scene.interfaceOrientation);
    }
  }
  CGRect bounds = self.view.bounds;
  NSDictionary *payload = @{
    @"status": status,
    @"angle": @(_hingeSeen ? _hingeAngle : -1),
    @"width": @(bounds.size.width),
    @"height": @(bounds.size.height),
    @"landscape": @(landscape)
  };
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  if (!data) return;
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  [_web evaluateJavaScript:[NSString stringWithFormat:@"window.rigDuo&&window.rigDuo(%@)", json] completionHandler:nil];
}

- (void)viewDidLayoutSubviews {
  [super viewDidLayoutSubviews];
  [self pushDuo];
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

  if (@available(iOS 27.1, *)) {
    __weak SaverController *weakSelf = self;
    UIHingeInteraction *hinge = [[UIHingeInteraction alloc] initWithUpdateHandler:^(UIHingeInteraction *interaction, UIHingeInteractionUpdate *update) {
      SaverController *strongSelf = weakSelf;
      if (!strongSelf) return;
      UIHinge *state = update.hinge;
      if (!state) {
        strongSelf->_hingeSeen = NO;
      } else {
        strongSelf->_hingeSeen = YES;
        strongSelf->_hingeStatus = state.status;
        strongSelf->_hingeAngle = state.angle;
      }
      [strongSelf pushDuo];
    }];
    [self.view addInteraction:hinge];
  }
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

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  [self pushDuo];
}

- (void)webView:(WKWebView *)webView
    requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
                          initiatedByFrame:(WKFrameInfo *)frame
                                      type:(WKMediaCaptureType)type
                           decisionHandler:(void (^)(WKPermissionDecision))decisionHandler API_AVAILABLE(ios(15.0)) {
  decisionHandler(WKPermissionDecisionGrant);
}

@end

static UIColor *SaverBackgroundColor(void) {
  return [UIColor colorWithRed:0.078 green:0.082 blue:0.110 alpha:1];
}

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
  if (![scene isKindOfClass:[UIWindowScene class]]) return;
  UIWindowScene *windowScene = (UIWindowScene *)scene;
  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
  self.window.backgroundColor = SaverBackgroundColor();
  self.window.rootViewController = [SaverController new];
  [self.window makeKeyAndVisible];
  UIApplication.sharedApplication.idleTimerDisabled = YES;
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
  UIApplication.sharedApplication.idleTimerDisabled = YES;
}

@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  application.idleTimerDisabled = YES;
  return YES;
}

- (UISceneConfiguration *)application:(UIApplication *)application
configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                              options:(UISceneConnectionOptions *)options {
  UISceneConfiguration *configuration = [[UISceneConfiguration alloc] initWithName:@"Default" sessionRole:connectingSceneSession.role];
  configuration.delegateClass = [SceneDelegate class];
  return configuration;
}

@end

int main(int argc, char *argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass([AppDelegate class]));
  }
}
