import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'; // Removed signInWithCustomToken
import { getFirestore, doc, addDoc, updateDoc, onSnapshot, collection, query, serverTimestamp } from 'firebase/firestore';

// 1. YOUR FIREBASE CONFIGURATION GOES HERE
// Paste the `firebaseConfig` object you copied from the Firebase Console here.
// Example:
const firebaseConfig = {
  apiKey: "AIzaSyBkFwqpkhoXj_bxMjxKvnvA3vlPGrJ_Sps",
  authDomain: "mathclubideas.firebaseapp.com",
  projectId: "mathclubideas",
  storageBucket: "mathclubideas.firebasestorage.app",
  messagingSenderId: "513454624671",
  appId: "1:513454624671:web:09af65e85abe3048caf7aa"
};


// 2. A UNIQUE IDENTIFIER FOR YOUR APPLICATION'S DATA IN FIRESTORE
// This string is used to organize your ideas in Firestore under a specific path:
// `artifacts/YOUR_CUSTOM_APP_ID/public/data/ideas`
// This is useful if you use the same Firebase project for multiple applications and want to keep their data separate.
const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v1"; // <<< You can change this string!

// --- Do NOT modify below this line unless you know what you are doing ---
const appId = YOUR_CUSTOM_APP_ID; // Use your defined custom app ID

// Create a context for Firebase services and user data
const FirebaseContext = createContext(null);

// Firebase Provider Component to initialize Firebase and manage authentication
const FirebaseProvider = ({ children }) => {
    const [app, setApp] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                // Initialize Firebase app
                const firebaseApp = initializeApp(firebaseConfig);
                setApp(firebaseApp);

                // Get Firestore and Auth instances
                const firestoreDb = getFirestore(firebaseApp);
                setDb(firestoreDb);
                const firebaseAuth = getAuth(firebaseApp);
                setAuth(firebaseAuth);

                // Set up authentication state listener
                const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        // Sign in anonymously if no user is found
                        try {
                            await signInAnonymously(firebaseAuth);
                        } catch (e) {
                            console.error("Error signing in anonymously:", e);
                            setError("Failed to authenticate. Please try again.");
                        }
                    }
                    setLoading(false);
                });

                return () => unsubscribe();
            } catch (err) {
                console.error("Failed to initialize Firebase:", err);
                setError("Failed to initialize the application. Please check console for details.");
                setLoading(false);
            }
        };

        initializeFirebase();
    }, []); // Run only once on component mount

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <div className="text-xl font-semibold animate-pulse">Loading Math Club Idea Board...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-800 p-4 rounded-lg shadow-md">
                Error: {error}
            </div>
        );
    }

    return (
        <FirebaseContext.Provider value={{ db, auth, userId }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// Hook to use Firebase services in components
const useFirebase = () => {
    return useContext(FirebaseContext);
};

// Idea Form Component
const IdeaForm = () => {
    const { db, userId } = useFirebase();
    const [ideaText, setIdeaText] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!ideaText.trim()) {
            setMessage('Idea cannot be empty!');
            return;
        }
        if (!db) {
            setMessage('Database not initialized. Please wait.');
            return;
        }

        try {
            const ideasCollectionRef = collection(db, `artifacts/${appId}/public/data/ideas`);
            await addDoc(ideasCollectionRef, {
                idea: ideaText,
                upvotes: 0,
                downvotes: 0,
                createdAt: serverTimestamp(),
                votedBy: {
                    up: [], // Store user IDs who upvoted
                    down: [] // Store user IDs who downvoted
                }
            });
            setIdeaText('');
            setMessage('Idea submitted successfully!');
            setTimeout(() => setMessage(''), 3000); // Clear message after 3 seconds
        } catch (error) {
            console.error("Error adding document: ", error);
            setMessage('Failed to submit idea. Please try again.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-8 max-w-2xl mx-auto border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100 text-center">Submit a New Idea</h2>
            <div className="mb-4">
                <textarea
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    rows="3"
                    placeholder="Type your idea here..."
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    required
                ></textarea>
            </div>
            <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
                Submit Idea
            </button>
            {message && <p className="mt-4 text-center text-sm font-medium text-green-600 dark:text-green-400">{message}</p>}
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">Your ideas are submitted anonymously.</p>
        </form>
    );
};

// Idea Card Component
const IdeaCard = ({ ideaData, id }) => {
    const { db, userId } = useFirebase();
    const { idea, upvotes, downvotes, votedBy = { up: [], down: [] } } = ideaData;

    // Determine if the current user has voted
    const hasUpvoted = votedBy.up && votedBy.up.includes(userId);
    const hasDownvoted = votedBy.down && votedBy.down.includes(userId);

    const handleVote = async (type) => {
        if (!db || !userId) {
            console.error("Database or User ID not available for voting.");
            return;
        }

        const ideaRef = doc(db, `artifacts/${appId}/public/data/ideas`, id);
        let updatedUpvotes = upvotes;
        let updatedDownvotes = downvotes;
        let updatedVotedByUp = [...(votedBy.up || [])];
        let updatedVotedByDown = [...(votedBy.down || [])];

        try {
            if (type === 'upvote') {
                if (hasUpvoted) {
                    // Already upvoted, remove upvote
                    updatedUpvotes--;
                    updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== userId);
                } else {
                    // Not upvoted, add upvote
                    updatedUpvotes++;
                    updatedVotedByUp.push(userId);
                    // If previously downvoted, remove downvote
                    if (hasDownvoted) {
                        updatedDownvotes--;
                        updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== userId);
                    }
                }
            } else if (type === 'downvote') {
                if (hasDownvoted) {
                    // Already downvoted, remove downvote
                    updatedDownvotes--;
                    updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== userId);
                } else {
                    // Not downvoted, add downvote
                    updatedDownvotes++;
                    updatedVotedByDown.push(userId);
                    // If previously upvoted, remove upvote
                    if (hasUpvoted) {
                        updatedUpvotes--;
                        updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== userId);
                    }
                }
            }

            await updateDoc(ideaRef, {
                upvotes: updatedUpvotes,
                downvotes: updatedDownvotes,
                votedBy: {
                    up: updatedVotedByUp,
                    down: updatedVotedByDown
                }
            });
        } catch (error) {
            console.error("Error updating vote: ", error);
        }
    };

    const netVotes = upvotes - downvotes;

    return (
        <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col items-center mr-4">
                <button
                    onClick={() => handleVote('upvote')}
                    className={`p-2 rounded-full transition duration-200 ${hasUpvoted ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-400 hover:text-white dark:hover:bg-green-600'} focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
                    aria-label="Upvote"
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 10.414V14a1 1 0 102 0v-3.586l1.293 1.293a1 1 0 001.414-1.414l-3-3z" clipRule="evenodd"></path>
                    </svg>
                </button>
                <span className={`font-bold text-lg my-1 ${netVotes > 0 ? 'text-green-600' : netVotes < 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
                    {netVotes}
                </span>
                <button
                    onClick={() => handleVote('downvote')}
                    className={`p-2 rounded-full transition duration-200 ${hasDownvoted ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-400 hover:text-white dark:hover:bg-red-600'} focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
                    aria-label="Downvote"
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm-.707 10.293a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 9.586V6a1 1 0 10-2 0v3.586L6.707 8.707a1 1 0 00-1.414 1.414l3 3z" clipRule="evenodd"></path>
                    </svg>
                </button>
            </div>
            <p className="flex-grow text-gray-900 dark:text-gray-100 text-lg font-medium">{idea}</p>
        </div>
    );
};

// Idea List Component
const IdeaList = () => {
    const { db } = useFirebase();
    const [ideas, setIdeas] = useState([]);
    const [loadingIdeas, setLoadingIdeas] = useState(true);
    const [ideasError, setIdeasError] = useState(null);

    useEffect(() => {
        if (!db) return;

        const ideasCollectionRef = collection(db, `artifacts/${appId}/public/data/ideas`);
        const q = query(ideasCollectionRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedIdeas = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort ideas by creation date (newest first) in client
            fetchedIdeas.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
            setIdeas(fetchedIdeas);
            setLoadingIdeas(false);
        }, (error) => {
            console.error("Error fetching ideas:", error);
            setIdeasError("Failed to load ideas. Please refresh.");
            setLoadingIdeas(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }, [db]);

    if (loadingIdeas) {
        return <div className="text-center text-gray-600 dark:text-gray-400">Loading ideas...</div>;
    }

    if (ideasError) {
        return <div className="text-center text-red-600 dark:text-red-400">{ideasError}</div>;
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100 text-center">Current Ideas</h2>
            {ideas.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400">No ideas submitted yet. Be the first!</p>
            ) : (
                ideas.map((idea) => (
                    <IdeaCard key={idea.id} ideaData={idea} id={idea.id} />
                ))
            )}
        </div>
    );
};

// Main App Component
const App = () => {
    const { userId } = useFirebase();

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-inter">
            <header className="py-6 bg-blue-700 dark:bg-blue-900 shadow-md">
                <div className="container mx-auto px-4 text-center">
                    <h1 className="text-4xl font-extrabold text-white mb-2">Math Club Idea Board</h1>
                    <p className="text-blue-100 text-lg">Suggest ideas and vote anonymously!</p>
                    {userId && (
                        <p className="text-blue-200 text-sm mt-2">Your anonymous user ID: <span className="font-mono bg-blue-800 dark:bg-blue-700 px-2 py-1 rounded">{userId}</span></p>
                    )}
                </div>
            </header>
            <main className="container mx-auto px-4 py-8">
                <IdeaForm />
                <IdeaList />
            </main>
            <footer className="py-4 text-center text-gray-600 dark:text-gray-400 text-sm">
                <p>&copy; {new Date().getFullYear()} Math Club. All rights reserved.</p>
                <p>Powered by Firebase & React.</p>
            </footer>
        </div>
    );
};

// Wrap the App component with FirebaseProvider to make Firebase services available
export default () => (
    <FirebaseProvider>
        <App />
    </FirebaseProvider>
);