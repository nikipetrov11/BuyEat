import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: 'AIzaSyCiJ65T_nMQ4mU4gR6v5NArM0GigZIz2eU',
  authDomain: 'digitalmenu-3757b.firebaseapp.com',
  projectId: 'digitalmenu-3757b',
  storageBucket: 'digitalmenu-3757b.firebasestorage.app',
  messagingSenderId: '469083214132',
  appId: '1:469083214132:web:f9e4e931c7a768f2d55561',
}

// Клиентите ползват основното приложение.
const app = initializeApp(config)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Админите ползват второ, именувано приложение. То пази сесията си отделно
// (другаде в хранилището на браузъра), затова вход в /admin не влиза в менюто и обратно.
const adminApp = initializeApp(config, 'admin')
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
