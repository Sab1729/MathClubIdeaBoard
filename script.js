// script.js

// Import Firebase modules using CDN URLs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =======================================================================================
// >>>>>>>>>>>>>>>>> IMPORTANT: YOUR FIREBASE CONFIGURATION HERE <<<<<<<<<<<<<<<<<<
// Replace these placeholder values with the actual `firebaseConfig` object
// you obtained from your Firebase project settings in the Firebase Console.
// =======================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBkFwqpkhoXj_bxMjxKvnvA3vlPGrJ_Sps",
  authDomain: "mathclubideas.firebaseapp.com",
  projectId: "mathclubideas",
  storageBucket: "mathclubideas.firebasestorage.app",
  messagingSenderId: "513454624671",
  appId: "1:513454624671:web:09af65e85abe3048caf7aa"
};


// =======================================================================================
// >>>>>>>>>>>>>>>>> UNIQUE IDENTIFIER FOR YOUR APP'S DATA IN FIRESTORE <<<<<<<<<<<<<<<<<
// This helps organize your data if you use the same Firebase project for multiple apps.
// Data path will be: `artifacts/YOUR_CUSTOM_APP_ID/public/data/ideas`
// =======================================================================================
const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v2-plain-js"; // You can change this string!

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null; // To store the anonymous user's ID

// --- DOM Elements ---
// Ensure these IDs match the elements in your index.html
const ideasList = document.getElementById('ideasList');
const ideaForm = document.getElementById('ideaForm');
const ideaTextInput = document.getElementById('ideaText');
const formMessage = document.getElementById('formMessage');
const userIdDisplay = document.getElementById('userIdDisplay');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorOverlay = document.getElementById('errorOverlay');
const errorMessageText = document.getElementById('errorMessageText');

// --- Firebase Initialization and Authentication ---
// This listener runs whenever the user's authentication state changes.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in (anonymously)
        currentUserId = user.uid;
        userIdDisplay.textContent = currentUserId;
        loadingOverlay.classList.add('hidden'); // Hide loading overlay once authenticated
        listenForIdeas(); // Start listening for ideas only after auth is complete
    } else {
        // No user signed in, attempt anonymous sign-in
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.error("Error signing in anonymously:", e);
            errorMessageText.textContent = "Failed to authenticate. Please ensure Anonymous Auth is enabled in your Firebase project.";
            errorOverlay.classList.remove('hidden'); // Show error overlay
            loadingOverlay.classList.add('hidden'); // Hide loading overlay
        }
    }
}, (error) => {
    // Handle errors during authentication state changes
    console.error("Auth state change error:", error);
    errorMessageText.textContent = "Authentication error. Please check your Firebase setup.";
    errorOverlay.classList.remove('hidden');
    loadingOverlay.classList.add('hidden');
});

// --- Idea Submission Handler ---
// Attaches an event listener to the idea submission form
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission (page reload)
    const ideaText = ideaTextInput.value.trim(); // Get idea text and remove whitespace

    // Input validation
    if (!ideaText) {
        displayFormMessage('Idea cannot be empty!', 'text-red-600');
        return;
    }
    // Check if Firebase is initialized and user is authenticated
    if (!db || !currentUserId) {
        displayFormMessage('App not ready. Please wait for authentication.', 'text-red-600');
        return;
    }

    try {
        // Reference to the 'ideas' collection in Firestore
        // Path: artifacts/YOUR_CUSTOM_APP_ID/public/data/ideas
        const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
        
        // Add a new document to the collection
        await addDoc(ideasCollectionRef, {
            idea: ideaText,
            upvotes: 0,
            downvotes: 0,
            createdAt: serverTimestamp(), // Firestore's timestamp for creation time
            votedBy: { // Stores which user IDs have voted to prevent multiple votes
                up: [],
                down: []
            }
        });
        ideaTextInput.value = ''; // Clear the input field after submission
        displayFormMessage('Idea submitted successfully!', 'text-green-600');
    } catch (error) {
        console.error("Error adding document: ", error);
        displayFormMessage('Failed to submit idea. Check browser console for details.', 'text-red-600');
    }
});

// Helper function to display temporary messages in the form area
function displayFormMessage(msg, colorClass) {
    formMessage.textContent = msg;
    formMessage.className = `mt-4 text-center text-sm font-medium ${colorClass}`;
    setTimeout(() => {
        formMessage.textContent = ''; // Clear message
        formMessage.className = ''; // Remove color class
    }, 3000); // Message disappears after 3 seconds
}

// --- Real-time Ideas Listener ---
// Sets up a real-time subscription to the 'ideas' collection
function listenForIdeas() {
    const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
    const q = query(ideasCollectionRef); // Create a query. No orderBy to avoid needing indexes.

    // onSnapshot provides real-time updates whenever data changes in the collection
    onSnapshot(q, (snapshot) => {
        const fetchedIdeas = snapshot.docs.map(doc => ({
            id: doc.id, // Get the document ID
            ...doc.data() // Get all data fields from the document
        }));

        // Sort ideas by creation date (newest first) directly in JavaScript
        fetchedIdeas.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

        renderIdeas(fetchedIdeas); // Re-render the ideas list
    }, (error) => {
        console.error("Error fetching ideas:", error);
        ideasList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Failed to load ideas. Please refresh and check your browser console.</p>`;
    });
}

// --- Render Ideas to DOM ---
// Clears existing ideas and renders the fetched ideas into the 'ideasList' div
function renderIdeas(ideas) {
    ideasList.innerHTML = ''; // Clear any previously rendered ideas

    if (ideas.length === 0) {
        ideasList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">No ideas submitted yet. Be the first!</p>`;
        return;
    }

    ideas.forEach(idea => {
        const ideaCard = createIdeaCard(idea); // Create a DOM element for each idea
        ideasList.appendChild(ideaCard); // Add the idea card to the list
    });
}

// --- Create Single Idea Card DOM Element ---
// Dynamically creates the HTML structure for an individual idea
function createIdeaCard(idea) {
    const cardDiv = document.createElement('div');
    cardDiv.className = "flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4 border border-gray-200 dark:border-gray-700";

    const voteContainer = document.createElement('div');
    voteContainer.className = "flex flex-col items-center mr-4";

    // Upvote Button
    const upvoteButton = document.createElement('button');
    // Apply dynamic styling based on whether the current user has upvoted
    upvoteButton.className = `p-2 rounded-full transition duration-200 ${idea.votedBy?.up?.includes(currentUserId) ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-400 hover:text-white dark:hover:bg-green-600'} focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`;
    upvoteButton.setAttribute('aria-label', 'Upvote');
    upvoteButton.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 10.414V14a1 1 0 102 0v-3.586l1.293 1.293a1 1 0 001.414-1.414l-3-3z" clipRule="evenodd"></path></svg>`;
    upvoteButton.addEventListener('click', () => handleVote(idea.id, 'upvote', idea));

    // Net Votes Display
    const netVotes = idea.upvotes - idea.downvotes;
    const voteCountSpan = document.createElement('span');
    // Apply dynamic color to vote count based on positive, negative, or zero votes
    voteCountSpan.className = `font-bold text-lg my-1 ${netVotes > 0 ? 'text-green-600' : netVotes < 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`;
    voteCountSpan.textContent = netVotes;

    // Downvote Button
    const downvoteButton = document.createElement('button');
    // Apply dynamic styling based on whether the current user has downvoted
    downvoteButton.className = `p-2 rounded-full transition duration-200 ${idea.votedBy?.down?.includes(currentUserId) ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-400 hover:text-white dark:hover:bg-red-600'} focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`;
    downvoteButton.setAttribute('aria-label', 'Downvote');
    downvoteButton.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm-.707 10.293a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 9.586V6a1 1 0 10-2 0v3.586L6.707 8.707a1 1 0 00-1.414 1.414l3 3z" clipRule="evenodd"></path></svg>`;
    downvoteButton.addEventListener('click', () => handleVote(idea.id, 'downvote', idea));

    // Append vote elements to the vote container
    voteContainer.appendChild(upvoteButton);
    voteContainer.appendChild(voteCountSpan);
    voteContainer.appendChild(downvoteButton);

    // Idea Text Paragraph
    const ideaTextP = document.createElement('p');
    ideaTextP.className = "flex-grow text-gray-900 dark:text-gray-100 text-lg font-medium";
    ideaTextP.textContent = idea.idea;

    // Append vote container and idea text to the main card div
    cardDiv.appendChild(voteContainer);
    cardDiv.appendChild(ideaTextP);

    return cardDiv; // Return the complete idea card element
}

// --- Handle Voting Logic ---
// Updates vote counts and user's votedBy array in Firestore
async function handleVote(ideaId, type, currentIdeaData) {
    if (!db || !currentUserId) {
        console.error("Database or User ID not available for voting. Cannot process vote.");
        return;
    }

    // Reference to the specific idea document in Firestore
    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaId);

    // Create mutable copies of vote counts and votedBy arrays
    let updatedUpvotes = currentIdeaData.upvotes;
    let updatedDownvotes = currentIdeaData.downvotes;
    let updatedVotedByUp = [...(currentIdeaData.votedBy?.up || [])];
    let updatedVotedByDown = [...(currentIdeaData.votedBy?.down || [])];

    const hasUpvoted = updatedVotedByUp.includes(currentUserId);
    const hasDownvoted = updatedVotedByDown.includes(currentUserId);

    try {
        if (type === 'upvote') {
            if (hasUpvoted) {
                // If user already upvoted, remove their upvote
                updatedUpvotes--;
                updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
            } else {
                // If user hasn't upvoted, add their upvote
                updatedUpvotes++;
                updatedVotedByUp.push(currentUserId);
                // If they previously downvoted, remove that downvote
                if (hasDownvoted) {
                    updatedDownvotes--;
                    updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
                }
            }
        } else if (type === 'downvote') {
            if (hasDownvoted) {
                // If user already downvoted, remove their downvote
                updatedDownvotes--;
                updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
            } else {
                // If user hasn't downvoted, add their downvote
                updatedDownvotes++;
                updatedVotedByDown.push(currentUserId);
                // If they previously upvoted, remove that upvote
                if (hasUpvoted) {
                    updatedUpvotes--;
                    updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
                }
            }
        }

        // Update the Firestore document with the new vote counts and votedBy arrays
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
        // Optionally, display an error message to the user
    }
}