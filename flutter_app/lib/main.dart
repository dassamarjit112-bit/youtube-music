import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_app/services/google_auth_service.dart';
ElevatedButton(
  onPressed: () async {
    // Create an instance of the service
    final authService = GoogleAuthService();
    // Trigger the sign-in
    await authService.handleSignIn();
  },
  child: Text("Sign in with Google"),
)
  
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // STABLE SERVER FIX FOR VITE
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 8080);
  server.listen((HttpRequest request) async {
    try {
      String path = request.uri.path == '/' ? '/index.html' : request.uri.path;
      if (path.startsWith('/')) path = path.substring(1);
      
      // Serve everything from the assets/www/ folder
      final byteData = await rootBundle.load('assets/www/$path');
      final bytes = byteData.buffer.asUint8List();
      
      // Correct MIME types are mandatory for ES Modules
      if (path.endsWith('.html')) request.response.headers.contentType = ContentType.html;
      else if (path.endsWith('.js')) request.response.headers.contentType = ContentType('application', 'javascript', charset: 'utf-8');
      else if (path.endsWith('.css')) request.response.headers.contentType = ContentType('text', 'css', charset: 'utf-8');
      else if (path.endsWith('.svg')) request.response.headers.contentType = ContentType('image', 'svg+xml');
      else if (path.endsWith('.png')) request.response.headers.contentType = ContentType('image', 'png');
      else if (path.endsWith('.json')) request.response.headers.contentType = ContentType.json;
      
      request.response.add(bytes);
    } catch (e) {
      request.response.statusCode = HttpStatus.notFound;
    }
    await request.response.close();
  });

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
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: InAppWebView(
          initialUrlRequest: URLRequest(
            url: WebUri("http://localhost:8080/index.html"), 
          ),
          initialSettings: InAppWebViewSettings(
            mediaPlaybackRequiresUserGesture: false,
            allowsInlineMediaPlayback: true,
            iframeAllow: "autoplay",
            iframeAllowFullscreen: true,
            javaScriptEnabled: true,
            domStorageEnabled: true,
            mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
          ),
          onConsoleMessage: (controller, consoleMessage) {
            debugPrint("WEB_CONSOLE: ${consoleMessage.message}");
          },
        ),
      ),
    );
  }
}
