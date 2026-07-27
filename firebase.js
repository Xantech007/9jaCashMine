// firebase.js — 9jaCash
// Initialize Firebase and export _9jaCash global for all pages

const firebaseConfig = {
  apiKey: "AIzaSyDmZHw7z3AkVRIOmrBaEj1eFlZd8jMwoWM",
  authDomain: "flutterwave-d3a50.firebaseapp.com",
  databaseURL: "https://flutterwave-d3a50-default-rtdb.firebaseio.com",
  projectId: "flutterwave-d3a50",
  storageBucket: "flutterwave-d3a50.firebasestorage.app",
  messagingSenderId: "806697073496",
  appId: "1:806697073496:web:0cacbaab77adb23452c32d",
  measurementId: "G-MFZ04JRGK3"
};


// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  console.log('Firebase initialized successfully');

  // Create the _9jaCash global object that ALL pages expect
  window._9jaCash = {
    app: firebase.app(),
    db: firebase.firestore(),
    auth: firebase.auth(),
    analytics: firebase.analytics ? firebase.analytics() : null
  };

  console.log('_9jaCash ready:', !!window._9jaCash.db);
} else {
  console.warn('Firebase SDK not loaded');
}

// Also keep old export for compatibility
window.firebaseApp = firebase;

// Create first admin account helper (run once in console)
async function createFirstAdmin(email, password) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    await firebase.firestore().collection('admins').doc(user.uid).set({
      email: email,
      role: 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      isActive: true
    });
    
    console.log('Admin created successfully:', user.uid);
    return user;
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

window.createFirstAdmin = createFirstAdmin;
