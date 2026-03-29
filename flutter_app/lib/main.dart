import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

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
    home: MusicTubeApp(),
  ));
}

class MusicTubeApp extends StatefulWidget {
  const MusicTubeApp({super.key});
  @override
  State<MusicTubeApp> createState() => _MusicTubeAppState();
}

class _MusicTubeAppState extends State<MusicTubeApp> {
  InAppWebViewController? _webViewController;

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Colors.black,
      systemNavigationBarIconBrightness: Brightness.light,
    ));

    return Scaffold(
      backgroundColor: Colors.black,
      body: InAppWebView(
        initialUrlRequest: URLRequest(
          url: WebUri("http://localhost:8080/index.html"), 
        ),
        initialSettings: InAppWebViewSettings(
          mediaPlaybackRequiresUserGesture: false,
          allowsInlineMediaPlayback: true,
          javaScriptEnabled: true,
          domStorageEnabled: true,
          mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
          useWideViewPort: true,
          loadWithOverviewMode: true,
          supportZoom: false,
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
    );
  }
}
