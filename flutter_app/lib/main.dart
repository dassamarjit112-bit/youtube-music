import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'dart:convert';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // STABLE SERVER FIX FOR VITE
  try {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 8080);
    server.listen((HttpRequest request) async {
      try {
        String path = request.uri.path;
        if (path == '/') {
          path = 'index.html';
        } else if (path.startsWith('/')) {
          path = path.substring(1);
        }
        
        path = path.replaceAll('//', '/');

        final byteData = await rootBundle.load('assets/www/$path');
        final bytes = byteData.buffer.asUint8List();
        
        if (path.endsWith('.html')) {
          request.response.headers.contentType = ContentType.html;
        } else if (path.endsWith('.js') || path.endsWith('.mjs')) {
          request.response.headers.contentType = ContentType('application', 'javascript', charset: 'utf-8');
        } else if (path.endsWith('.css')) {
          request.response.headers.contentType = ContentType('text', 'css', charset: 'utf-8');
        } else if (path.endsWith('.svg')) {
          request.response.headers.contentType = ContentType('image', 'svg+xml');
        } else if (path.endsWith('.png')) {
          request.response.headers.contentType = ContentType('image', 'png');
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
          request.response.headers.contentType = ContentType('image', 'jpeg');
        } else if (path.endsWith('.json')) {
          request.response.headers.contentType = ContentType.json;
        }
        
        request.response.add(bytes);
      } catch (e) {
        request.response.statusCode = HttpStatus.notFound;
        debugPrint("Asset load error: $e");
      } finally {
        await request.response.close();
      }
    });
  } catch (e) {
    debugPrint("Critical Server Error: $e");
  }

  runApp(const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: YTMApp(),
  ));
}

class YTMApp extends StatefulWidget {
  const YTMApp({super.key});
  @override
  State<YTMApp> createState() => _YTMAppState();
}

class _YTMAppState extends State<YTMApp> {
  InAppWebViewController? _webViewController;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  // Integrated Native Sign-In Handler
  Future<void> _handleNativeGoogleSignIn() async {
    try {
      final GoogleSignInAccount? account = await _googleSignIn.signIn();
      
      if (account != null && _webViewController != null) {
        // Create a structured Map for the data
        final Map<String, dynamic> userData = {
          "email": account.email,
          "full_name": account.displayName,
          "id": account.id,
          "avatar_url": account.photoUrl,
        };
        
        // Convert to JSON and send to React
        final String userJson = jsonEncode(userData);
        await _webViewController!.evaluateJavascript(
          source: 'window.onNativeLoginSuccess($userJson)'
        );
      }
    } catch (error) {
      debugPrint("Google Sign-In Error: $error");
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            InAppWebView(
              initialUrlRequest: URLRequest(
                url: WebUri("http://localhost:8080/index.html"), 
              ),
              initialSettings: InAppWebViewSettings(
                mediaPlaybackRequiresUserGesture: false,
                allowsInlineMediaPlayback: true,
                javaScriptEnabled: true,
                domStorageEnabled: true,
                mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
              ),
              onWebViewCreated: (controller) {
                _webViewController = controller;

                // Set up the JavaScript Handler for 'FlutterAuth'
                controller.addJavaScriptHandler(
                  handlerName: 'FlutterAuth',
                  callback: (args) {
                    // This triggers when React calls: window.flutter_inappwebview.callHandler('FlutterAuth', 'triggerGoogleLogin')
                    if (args.isNotEmpty && args[0] == 'triggerGoogleLogin') {
                      _handleNativeGoogleSignIn();
                    }
                  },
                );
              },
              onReceivedError: (controller, request, error) {
                if (request.url.toString().contains("localhost:8080")) {
                  Future.delayed(const Duration(milliseconds: 500), () {
                    controller.reload();
                  });
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
