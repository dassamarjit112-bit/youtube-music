import 'dart:io';
import 'dart:convert'; // Added for jsonEncode
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:ytm_clone/services/google_auth_service.dart';

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
        } else if (path.endsWith('.json')) {
          request.response.headers.contentType = ContentType.json;
        }
        
        request.response.add(bytes);
      } catch (e) {
        request.response.statusCode = HttpStatus.notFound;
      } finally {
        await request.response.close();
      }
    });
  } catch (e) {
    debugPrint("Server Error: $e");
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
  final GoogleAuthService _authService = GoogleAuthService();
  InAppWebViewController? _webViewController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // WebView Layer
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
              },
              onReceivedError: (controller, request, error) {
                if (request.url.toString().contains("localhost:8080")) {
                  Future.delayed(const Duration(milliseconds: 500), () {
                    controller.reload();
                  });
                }
              },
            ),
            
            // Native Auth Button
            Positioned(
              bottom: 20,
              right: 20,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                ),
                onPressed: () async {
                  // 1. Trigger Google Sign In
                  await _authService.handleSignIn();
                  
                  // 2. Get the synced User from Supabase
                  final user = Supabase.instance.client.auth.currentUser;

                  if (user != null && _webViewController != null) {
                    // 3. Prepare data for the React App
                    final userData = {
                      "id": user.id,
                      "email": user.email,
                      "full_name": user.userMetadata?['full_name'] ?? 'User',
                      "avatar_url": user.userMetadata?['avatar_url'] ?? '',
                    };

                    String jsonUser = jsonEncode(userData);
                    
                    // 4. Inject into the WebView to trigger the Redirect in Auth.tsx
                    await _webViewController!.evaluateJavascript(source: """
                      if (window.onNativeLoginSuccess) {
                        window.onNativeLoginSuccess($jsonUser);
                      } else {
                        console.error('Web App bridge not ready');
                      }
                    """);
                  }
                },
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text("Sign in with Google"),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
