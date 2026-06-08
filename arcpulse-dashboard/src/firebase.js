import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as _signOut, onAuthStateChanged } from 'firebase/auth';

const app = initializeApp({
  apiKey: 'AIzaSyAPftHIl4HzfyKFIR50OqjKsi3CTJThZz4',
  authDomain: 'arcpulse.firebaseapp.com',
  projectId: 'arcpulse',
  storageBucket: 'arcpulse.firebasestorage.app',
  messagingSenderId: '304203583577',
  appId: '1:304203583577:web:bae668db6496401f17e148',
});

export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Store the Google OIDC token (accepted by Cloud Run IAM)
let _googleIdToken = null;
let _tokenExpiry = 0;

export function getCloudRunToken() {
  if (_googleIdToken && Date.now() < _tokenExpiry) return _googleIdToken;
  return null;
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.idToken) {
    _googleIdToken = credential.idToken;
    _tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 min (tokens last 1hr)
  }
  return result;
}

export async function signOutUser() {
  _googleIdToken = null;
  _tokenExpiry = 0;
  return _signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
