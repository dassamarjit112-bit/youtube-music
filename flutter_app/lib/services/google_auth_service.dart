import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class GoogleAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: '79361906244-0umpdsl6bk6grunhuotbe5qhhb2911uf.apps.googleusercontent.com',
  );

  Future<Map<String, dynamic>?> handleSignIn() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser != null) {
        final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
        
        // Sync with Supabase
        final AuthResponse res = await Supabase.instance.client.auth.signInWithIdToken(
          provider: OAuthProvider.google,
          idToken: googleAuth.idToken!,
          accessToken: googleAuth.accessToken,
        );

        // Return the user details to main.dart
        return {
          "id": res.user?.id,
          "email": res.user?.email,
          "full_name": googleUser.displayName,
          "avatar_url": googleUser.photoUrl,
        };
      }
    } catch (error) {
      debugPrint("Login Failed: $error");
    }
    return null;
  }
}
