// ADD THIS LINE: It defines debugPrint
import 'package:flutter/material.dart'; 
import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthService {
  // Use the CLIENT ID from the "Web Application" type in Google Console
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: '79361906244-0umpdsl6bk6grunhuotbe5qhhb2911uf.apps.googleusercontent.com',
  );

  Future<void> handleSignIn() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      
      if (googleUser != null) {
        final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
        final String? idToken = googleAuth.idToken;

        // Now this will work!
        debugPrint("Token obtained: $idToken");
      }
    } catch (error) {
      debugPrint("Login Failed: $error");
    }
  }
}
