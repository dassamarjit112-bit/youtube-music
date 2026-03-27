Import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

class GoogleAuthService {
  // Use the CLIENT ID from the "Web Application" type in Google Console
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: '79361906244-al0q0s3lc37fqn1el1488gjd0u02mrrj.apps.googleusercontent.com',
  );

  Future<void> handleSignIn() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      
      if (googleUser != null) {
        final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
        
        // This is the "Passport" you send to your Node.js/Vercel backend
        final String? idToken = googleAuth.idToken;

        print("Token obtained: $idToken");

        // Now send this to your backend to verify the user
        // await sendTokenToBackend(idToken);
      }
    } catch (error) {
      print("Login Failed: $error");
    }
  }
}
