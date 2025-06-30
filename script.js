// script.js

// Import Firebase modules using CDN URLs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Marked.js is globally available because it's loaded via CDN in index.html
// If you use a more advanced module bundler, you might import it differently.
const marked = window.marked; // Access the global 'marked' object

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

// Formatting Buttons
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');

// --- Firebase Initialization and Authentication ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        userIdDisplay.textContent = currentUserId;
        loadingOverlay.classList.add('hidden');
        listenForIdeas();
    } else {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.error("Error signing in anonymously:", e);
            errorMessageText.textContent = "Failed to authenticate. Please ensure Anonymous Auth is enabled in your Firebase project.";
            errorOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('hidden');
        }
    }
}, (error) => {
    console.error("Auth state change error:", error);
    errorMessageText.textContent = "Authentication error. Please check your Firebase setup.";
    errorOverlay.classList.remove('hidden');
    loadingOverlay.classList.add('hidden');
});

// --- Idea Submission Handler ---
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ideaContent = ideaTextInput.value.trim(); // Get idea content (will contain Markdown)

    if (!ideaContent) {
        displayFormMessage('Idea cannot be empty!', 'text-red-600');
        return;
    }
    if (!db || !currentUserId) {
        displayFormMessage('App not ready. Please wait for authentication.', 'text-red-600');
        return;
    }

    try {
        const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
        await addDoc(ideasCollectionRef, {
            idea: ideaContent, // Store the raw Markdown content
            upvotes: 0,
            downvotes: 0,
            createdAt: serverTimestamp(),
            votedBy: {
                up: [],
                down: []
            }
        });
        ideaTextInput.value = ''; // Clear input
        displayFormMessage('Idea submitted successfully!', 'text-green-600');
    } catch (error) {
        console.error("Error adding document: ", error);
        displayFormMessage('Failed to submit idea. Check console.', 'text-red-600');
    }
});

function displayFormMessage(msg, colorClass) {
    formMessage.textContent = msg;
    formMessage.className = `mt-4 text-center text-sm font-medium ${colorClass}`;
    setTimeout(() => {
        formMessage.textContent = '';
        formMessage.className = '';
    }, 3000);
}

// --- Formatting Button Handlers ---
function applyFormatting(syntaxBefore, syntaxAfter) {
    const textarea = ideaTextInput;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = textarea.value.substring(0, start) + 
                    syntaxBefore + selectedText + syntaxAfter + 
                    textarea.value.substring(end);
    textarea.value = newText;
    
    // Maintain cursor position or select the wrapped text
    if (selectedText.length === 0) {
        textarea.selectionStart = start + syntaxBefore.length;
        textarea.selectionEnd = start + syntaxBefore.length;
    } else {
        textarea.selectionStart = start;
        textarea.selectionEnd = start + syntaxBefore.length + selectedText.length + syntaxAfter.length;
    }
    textarea.focus();
}

boldBtn.addEventListener('click', () => applyFormatting('**', '**'));
italicBtn.addEventListener('click', () => applyFormatting('*', '*'));
// For underline, using direct HTML <u> tag for simplicity, as Markdown doesn't have native underline.
underlineBtn.addEventListener('click', () => applyFormatting('<u>', '</u>'));


// --- Real-time Ideas Listener ---
function listenForIdeas() {
    const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
    const q = query(ideasCollectionRef);

    onSnapshot(q, (snapshot) => {
        const fetchedIdeas = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        fetchedIdeas.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

        renderIdeas(fetchedIdeas);
    }, (error) => {
        console.error("Error fetching ideas:", error);
        ideasList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Failed to load ideas. Please refresh.</p>`;
    });
}

// --- Render Ideas to DOM ---
function renderIdeas(ideas) {
    ideasList.innerHTML = '';
    if (ideas.length === 0) {
        ideasList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400">No ideas submitted yet. Be the first!</p>`;
        return;
    }

    ideas.forEach(idea => {
        const ideaCard = createIdeaCard(idea);
        ideasList.appendChild(ideaCard);
    });
}

// --- Create Single Idea Card DOM Element ---
function createIdeaCard(idea) {
    const cardDiv = document.createElement('div');
    cardDiv.className = "flex items-center bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-4 border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-[1.01]";

    const voteContainer = document.createElement('div');
    voteContainer.className = "flex flex-col items-center mr-4";

    const upvoteButton = document.createElement('button');
    upvoteButton.className = `p-2 rounded-full transition duration-200 ${idea.votedBy?.up?.includes(currentUserId) ? 'bg-green-600 text-white shadow-md' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-green-500 hover:text-white dark:hover:bg-green-600'} focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`;
    upvoteButton.setAttribute('aria-label', 'Upvote');
    upvoteButton.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 10.414V14a1 1 0 102 0v-3.586l1.293 1.293a1 1 0 001.414-1.414l-3-3z" clipRule="evenodd"></path></svg>`;
    upvoteButton.addEventListener('click', () => handleVote(idea.id, 'upvote', idea));

    const netVotes = idea.upvotes - idea.downvotes;
    const voteCountSpan = document.createElement('span');
    voteCountSpan.className = `font-bold text-xl my-1 ${netVotes > 0 ? 'text-green-600' : netVotes < 0 ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`;
    voteCountSpan.textContent = netVotes;

    const downvoteButton = document.createElement('button');
    downvoteButton.className = `p-2 rounded-full transition duration-200 ${idea.votedBy?.down?.includes(currentUserId) ? 'bg-red-600 text-white shadow-md' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-500 hover:text-white dark:hover:bg-red-600'} focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`;
    downvoteButton.setAttribute('aria-label', 'Downvote');
    downvoteButton.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm-.707 10.293a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 9.586V6a1 1 0 10-2 0v3.586L6.707 8.707a1 1 0 00-1.414 1.414l3 3z" clipRule="evenodd"></path></svg>`;
    downvoteButton.addEventListener('click', () => handleVote(idea.id, 'downvote', idea));

    voteContainer.appendChild(upvoteButton);
    voteContainer.appendChild(voteCountSpan);
    voteContainer.appendChild(downvoteButton);

    const ideaContentDiv = document.createElement('div');
    ideaContentDiv.className = "flex-grow text-gray-900 dark:text-gray-100 text-lg font-medium";
    // Use marked.js to convert markdown to HTML
    ideaContentDiv.innerHTML = marked.parse(idea.idea || ''); // Parse the idea text as Markdown

    cardDiv.appendChild(voteContainer);
    cardDiv.appendChild(ideaContentDiv);

    return cardDiv;
}

// --- Handle Voting Logic ---
async function handleVote(ideaId, type, currentIdeaData) {
    if (!db || !currentUserId) {
        console.error("Database or User ID not available for voting. Cannot process vote.");
        return;
    }

    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaId);

    let updatedUpvotes = currentIdeaData.upvotes;
    let updatedDownvotes = currentIdeaData.downvotes;
    let updatedVotedByUp = [...(currentIdeaData.votedBy?.up || [])];
    let updatedVotedByDown = [...(currentIdeaData.votedBy?.down || [])];

    const hasUpvoted = updatedVotedByUp.includes(currentUserId);
    const hasDownvoted = updatedVotedByDown.includes(currentUserId);

    try {
        if (type === 'upvote') {
            if (hasUpvoted) {
                updatedUpvotes--;
                updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
            } else {
                updatedUpvotes++;
                updatedVotedByUp.push(currentUserId);
                if (hasDownvoted) {
                    updatedDownvotes--;
                    updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
                }
            }
        } else if (type === 'downvote') {
            if (hasDownvoted) {
                updatedDownvotes--;
                updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
            } else {
                updatedDownvotes++;
                updatedVotedByDown.push(currentUserId);
                if (hasUpvoted) {
                    updatedUpvotes--;
                    updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
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
}