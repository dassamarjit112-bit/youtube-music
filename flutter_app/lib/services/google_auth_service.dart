import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart'; // Ensure this is imported

class GoogleAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: '79361906244-0umpdsl6bk6grunhuotbe5qhhb2911uf.apps.googleusercontent.com',
  );

  Future<void> handleSignIn() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      
      if (googleUser != null) {
        final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
        final String? idToken = googleAuth.idToken;
        final String? accessToken = googleAuth.accessToken;

        if (idToken == null) throw 'No ID Token found.';

        // --- THE MISSING STEP: SYNC WITH SUPABASE ---
        await Supabase.instance.client.auth.signInWithIdToken(
          provider: OAuthProvider.google,
          idToken: idToken,
          accessToken: accessToken,
        );

        debugPrint("Supabase Profile Created/Synced Successfully!");
      }
    } catch (error) {
      debugPrint("Login Sync Failed: $error");
    }
  }
}
