// script1.js

// Import Firebase modules using CDN URLs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Marked.js is globally available because it's loaded via CDN in index.html
const marked = window.marked;

marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
});

// Firebase Configuration (same as your idea board)
const firebaseConfig = {
  apiKey: "AIzaSyBkFwqpkhoXj_bxMjxKvnvA3vlPGrJ_Sps",
  authDomain: "mathclubideas.firebaseapp.com",
  projectId: "mathclubideas",
  storageBucket: "mathclubideas.firebasestorage.app",
  messagingSenderId: "513454624671",
  appId: "1:513454624671:web:09af65e85abe3048caf7aa"
};

// Use the SAME app ID as your idea board
const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v8-design-refresh";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null;
let currentSortOption = 'mostReviewedThenHard'; // Default: most reviewed then hardest
let itemsPerPage = 10;
let currentPage = 0;
let allProblems = [];
let totalProblems = 0;

// --- DOM Elements ---
const problemsList = document.getElementById('problemsList');
const problemForm = document.getElementById('problemForm');
const problemTextInput = document.getElementById('problemText');
const answerTextInput = document.getElementById('answerText');
const formMessage = document.getElementById('formMessage');
const userIdDisplay = document.getElementById('userIdDisplay');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorOverlay = document.getElementById('errorOverlay');
const errorMessageText = document.getElementById('errorMessageText');

// Sort and Pagination Elements
const sortOptionsDropdown = document.getElementById('sortOptions');
const itemsPerPageDropdown = document.getElementById('itemsPerPage');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
let problemToDeleteId = null;

// Create pagination elements if they don't exist
let paginationDiv, prevBtn, nextBtn, pageInfo;

// --- Firebase Initialization and Authentication ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        userIdDisplay.textContent = currentUserId.substring(0, 8) + '...';
        console.log("User authenticated:", currentUserId);
        listenForProblems(); // Start listening for problems
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

// --- Problem Submission Handler ---
problemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problemContent = problemTextInput.value.trim();
    const answerContent = answerTextInput.value.trim();

    if (!problemContent || !answerContent) {
        displayFormMessage('Both problem and answer are required!', 'text-red-600');
        return;
    }
    if (!db || !currentUserId) {
        displayFormMessage('App not ready. Please wait for authentication.', 'text-red-600');
        return;
    }

    try {
        const problemsCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`);
        await addDoc(problemsCollectionRef, {
            problem: problemContent,
            answer: answerContent,
            difficultyScore: 3.0,
            difficultyRatings: {},
            totalDifficultyRatings: 0,
            estimatedDifficulty: 3.0,
            createdAt: serverTimestamp(),
            submittedBy: currentUserId,
            status: "active",
            type: "integral"
        });
        problemTextInput.value = '';
        answerTextInput.value = '';
        displayFormMessage('Integral problem submitted successfully!', 'text-green-600');
    } catch (error) {
        console.error("Error adding document: ", error);
        displayFormMessage('Failed to submit problem. Check console for details.', 'text-red-600');
    }
});

function displayFormMessage(msg, colorClass) {
    formMessage.textContent = msg;
    formMessage.className = `mt-2 text-center text-sm font-medium ${colorClass}`;
    setTimeout(() => {
        formMessage.textContent = '';
        formMessage.className = '';
    }, 3000);
}

// --- Sort Handler ---
sortOptionsDropdown.addEventListener('change', (e) => {
    currentSortOption = e.target.value;
    currentPage = 0; // Reset to first page when changing sort
    applyAndRenderSorting();
});

// --- Items Per Page Handler ---
itemsPerPageDropdown.addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 0; // Reset to first page
    applyAndRenderSorting();
});

// --- Real-time Problems Listener ---
function listenForProblems() {
    console.log("Setting up real-time listener for integral problems...");
    
    try {
        const problemsCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`);
        const q = query(problemsCollectionRef);
        
        onSnapshot(q, (snapshot) => {
            console.log("Data received:", snapshot.docs.length, "integral problems");
            
            allProblems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            totalProblems = allProblems.length;
            updateProblemsCount();
            
            // Hide loading overlay
            loadingOverlay.classList.add('hidden');
            
            // Apply sorting and render
            applyAndRenderSorting();
            
        }, (error) => {
            console.error("Error in listener:", error);
            problemsList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Failed to load integral problems. Error: ${error.message}</p>`;
            loadingOverlay.classList.add('hidden');
        });
        
    } catch (error) {
        console.error("Error setting up listener:", error);
        problemsList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Setup error: ${error.message}</p>`;
        loadingOverlay.classList.add('hidden');
    }
}

// --- Update Problems Count Display ---
function updateProblemsCount() {
    const countDisplay = document.getElementById('problemsCountDisplay');
    if (countDisplay) {
        countDisplay.textContent = `Total: ${totalProblems} problems`;
    }
}

// --- Apply Sorting and Render with Pagination ---
function applyAndRenderSorting() {
    console.log("applyAndRenderSorting called. Current page:", currentPage, "Items per page:", itemsPerPage, "All problems:", allProblems.length);
    
    let sortedProblems = [...allProblems];
    
    sortedProblems.sort((a, b) => {
        // Helper function to handle undefined values
        const getValue = (obj, key, defaultValue = 0) => {
            return obj[key] !== undefined && obj[key] !== null ? obj[key] : defaultValue;
        };
        
        const aReviews = getValue(a, 'totalDifficultyRatings', 0);
        const bReviews = getValue(b, 'totalDifficultyRatings', 0);
        const aDifficulty = getValue(a, 'estimatedDifficulty', 3);
        const bDifficulty = getValue(b, 'estimatedDifficulty', 3);
        
        switch(currentSortOption) {
            case 'mostReviewedThenHard':
                // First sort by number of reviews (descending), then by difficulty (descending)
                if (bReviews !== aReviews) {
                    return bReviews - aReviews;
                }
                // If same number of reviews, sort by difficulty (hardest first)
                return bDifficulty - aDifficulty;
                
            case 'hardestFirst':
                return bDifficulty - aDifficulty;
                
            case 'easiestFirst':
                return aDifficulty - bDifficulty;
                
            case 'mostReviewed':
                return bReviews - aReviews;
                
            case 'recent':
                const timeA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
                const timeB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
                return timeB - timeA;
                
            default:
                return bReviews - aReviews;
        }
    });
    
    // Apply pagination
    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedProblems = sortedProblems.slice(startIndex, endIndex);
    
    renderProblems(paginatedProblems);
    updatePagination(sortedProblems.length);
}

// --- Update Pagination ---
function updatePagination(totalFilteredProblems) {
    // Create or update pagination elements
    if (!paginationDiv) {
        paginationDiv = document.createElement('div');
        paginationDiv.id = 'pagination';
        paginationDiv.className = "mt-8 flex justify-center items-center space-x-4";
        
        prevBtn = document.createElement('button');
        prevBtn.id = 'prevBtn';
        prevBtn.className = "px-4 py-2 border dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center";
        prevBtn.innerHTML = `
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Previous
        `;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                applyAndRenderSorting();
            }
        });
        
        pageInfo = document.createElement('span');
        pageInfo.id = 'pageInfo';
        pageInfo.className = "text-sm dark:text-gray-400 font-serif";
        
        nextBtn = document.createElement('button');
        nextBtn.id = 'nextBtn';
        nextBtn.className = "px-4 py-2 border dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center";
        nextBtn.innerHTML = `
            Next
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
        `;
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(totalFilteredProblems / itemsPerPage);
            if (currentPage < totalPages - 1) {
                currentPage++;
                applyAndRenderSorting();
            }
        });
        
        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);
        
        problemsList.parentNode.appendChild(paginationDiv);
    }
    
    const totalPages = Math.ceil(totalFilteredProblems / itemsPerPage);
    const startItem = (currentPage * itemsPerPage) + 1;
    const endItem = Math.min((currentPage + 1) * itemsPerPage, totalFilteredProblems);
    
    // Make sure we show correct info even when there are 0 items
    const displayStartItem = totalFilteredProblems > 0 ? startItem : 0;
    const displayEndItem = totalFilteredProblems > 0 ? endItem : 0;
    
    pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages || 1} (${displayStartItem}-${displayEndItem} of ${totalFilteredProblems})`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage >= totalPages - 1 || totalPages <= 1;
    
    // Show/hide pagination
    if (totalFilteredProblems <= itemsPerPage || totalPages <= 1) {
        paginationDiv.classList.add('hidden');
    } else {
        paginationDiv.classList.remove('hidden');
    }
}

// --- Render Problems ---
function renderProblems(problems) {
    problemsList.innerHTML = '';
    
    if (problems.length === 0) {
        problemsList.innerHTML = `
            <div class="text-center py-12">
                <svg class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-gray-500 dark:text-gray-400 text-lg mb-4 font-serif">No integral problems found!</p>
                <p class="text-gray-400 dark:text-gray-500 text-sm font-serif">Be the first to submit an integral problem.</p>
            </div>`;
        return;
    }

    problems.forEach(problem => {
        const problemCard = createProblemCard(problem);
        problemsList.appendChild(problemCard);
    });
    
    // Process LaTeX after a short delay
    setTimeout(() => {
        if (window.MathJax && window.MathJax.typeset) {
            try {
                window.MathJax.typeset();
            } catch (e) {
                console.log("MathJax typeset error:", e);
            }
        }
    }, 100);
}

// --- Create Problem Card ---
function createProblemCard(problem) {
    const cardDiv = document.createElement('div');
    cardDiv.className = "problem-card rounded-lg p-6";
    
    // Header with difficulty badge and ratings count
    const headerDiv = document.createElement('div');
    headerDiv.className = "flex justify-between items-start mb-4";
    
    const difficultyInfo = document.createElement('div');
    difficultyInfo.className = "flex items-center space-x-2";
    
    const difficulty = getDifficultyLevel(problem.estimatedDifficulty || 3.0);
    const difficultyBadge = document.createElement('span');
    difficultyBadge.className = `difficulty-badge difficulty-${difficulty.level}`;
    difficultyBadge.textContent = difficulty.text;
    
    const reviewsCount = problem.totalDifficultyRatings || 0;
    const reviewsText = reviewsCount === 1 ? '1 review' : `${reviewsCount} reviews`;
    const reviewsSpan = document.createElement('span');
    reviewsSpan.className = "text-xs text-gray-500 dark:text-gray-400";
    reviewsSpan.textContent = reviewsText;
    
    difficultyInfo.appendChild(difficultyBadge);
    difficultyInfo.appendChild(reviewsSpan);
    
    const metaDiv = document.createElement('div');
    metaDiv.className = "text-sm text-gray-500 dark:text-gray-400 text-right";
    metaDiv.innerHTML = `
        <div>Avg: ${problem.estimatedDifficulty ? problem.estimatedDifficulty.toFixed(1) : '3.0'}/5</div>
    `;
    
    headerDiv.appendChild(difficultyInfo);
    headerDiv.appendChild(metaDiv);
    cardDiv.appendChild(headerDiv);
    
    // Problem Statement
    const problemDiv = document.createElement('div');
    problemDiv.className = "mb-4";
    problemDiv.innerHTML = `
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">Problem:</div>
        <div class="math-display bg-gray-50 dark:bg-gray-800 rounded p-4 font-mono text-lg overflow-x-auto">
            \\[ ${problem.problem} \\]
        </div>
    `;
    cardDiv.appendChild(problemDiv);
    
    // Copy Problem LaTeX Button
    const copyProblemBtn = document.createElement('button');
    copyProblemBtn.className = "text-xs px-3 py-1 mb-4 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center";
    copyProblemBtn.innerHTML = `
        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Copy Problem LaTeX
    `;
    copyProblemBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(problem.problem).then(() => {
            copyProblemBtn.innerHTML = `
                <svg class="w-3 h-3 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
            `;
            copyProblemBtn.classList.add('bg-green-100', 'dark:bg-green-900');
            setTimeout(() => {
                copyProblemBtn.innerHTML = `
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Problem LaTeX
                `;
                copyProblemBtn.classList.remove('bg-green-100', 'dark:bg-green-900');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            copyProblemBtn.innerHTML = `
                <svg class="w-3 h-3 mr-1 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Failed to copy
            `;
            setTimeout(() => {
                copyProblemBtn.innerHTML = `
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Problem LaTeX
                `;
            }, 2000);
        });
    });
    cardDiv.appendChild(copyProblemBtn);
    
    // Answer Section (initially hidden)
    const answerDiv = document.createElement('div');
    answerDiv.className = "answer-section hidden";
    answerDiv.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300 font-serif">Answer:</div>
            <button class="copy-answer-latex-btn text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Answer LaTeX
            </button>
        </div>
        <div class="math-display font-mono text-lg overflow-x-auto">
            \\[ ${problem.answer} \\]
        </div>
    `;
    cardDiv.appendChild(answerDiv);
    
    // Difficulty Rating Section
    const ratingDiv = document.createElement('div');
    ratingDiv.className = "mb-4";
    ratingDiv.innerHTML = `
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">How difficult was it? (1=easiest, 5=hardest):</div>
        <div class="flex space-x-1">
            ${[1,2,3,4,5].map(num => {
                const userRating = problem.difficultyRatings && problem.difficultyRatings[currentUserId];
                const isActive = userRating === num;
                return `
                    <button class="difficulty-btn px-3 py-1 rounded text-sm font-medium transition-colors rating-btn
                        ${isActive 
                            ? num <= 2 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700' 
                            : num === 3 ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700'
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700'
                        }"
                        data-rating="${num}" data-problem-id="${problem.id}">
                        ${num}
                    </button>
                `;
            }).join('')}
        </div>
    `;
    cardDiv.appendChild(ratingDiv);
    
    // Action Buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = "flex flex-wrap justify-between items-center mt-6 pt-4 border-t dark:border-gray-700";
    
    // Left side: Show Answer button
    const leftActions = document.createElement('div');
    leftActions.className = "flex items-center space-x-4";
    
    const showAnswerBtn = document.createElement('button');
    showAnswerBtn.className = "text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center";
    showAnswerBtn.innerHTML = `
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span>Show Answer</span>
    `;
    
    showAnswerBtn.addEventListener('click', () => {
        answerDiv.classList.toggle('hidden');
        if (answerDiv.classList.contains('hidden')) {
            showAnswerBtn.innerHTML = `
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Show Answer</span>
            `;
            showAnswerBtn.classList.add('bg-blue-100', 'dark:bg-blue-900');
            showAnswerBtn.classList.remove('bg-blue-200', 'dark:bg-blue-800');
        } else {
            showAnswerBtn.innerHTML = `
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                <span>Hide Answer</span>
            `;
            showAnswerBtn.classList.remove('bg-blue-100', 'dark:bg-blue-900');
            showAnswerBtn.classList.add('bg-blue-200', 'dark:bg-blue-800');
        }
    });
    
    leftActions.appendChild(showAnswerBtn);
    
    // Right side: Edit and Delete buttons (only for owner)
    const rightActions = document.createElement('div');
    rightActions.className = "flex items-center space-x-3";
    
    if (problem.submittedBy === currentUserId) {
        const editBtn = document.createElement('button');
        editBtn.className = "text-sm px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors flex items-center";
        editBtn.innerHTML = `
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
        `;
        editBtn.addEventListener('click', () => showEditForm(problem, cardDiv));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = "text-sm px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors flex items-center";
        deleteBtn.innerHTML = `
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 011.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
        `;
        deleteBtn.addEventListener('click', () => {
            problemToDeleteId = problem.id;
            deleteModal.classList.remove('hidden');
        });
        
        rightActions.appendChild(editBtn);
        rightActions.appendChild(deleteBtn);
    }
    
    actionsDiv.appendChild(leftActions);
    actionsDiv.appendChild(rightActions);
    cardDiv.appendChild(actionsDiv);
    
    // Add timestamp
    if (problem.createdAt) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = "text-xs text-gray-500 dark:text-gray-500 mt-4 pt-2 border-t dark:border-gray-700 flex items-center";
        timestampDiv.innerHTML = `
            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Submitted: ${problem.createdAt.toDate().toLocaleString()}
        `;
        cardDiv.appendChild(timestampDiv);
    }
    
    // Add event listeners for difficulty rating buttons
    const difficultyButtons = cardDiv.querySelectorAll('.difficulty-btn');
    difficultyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rating = parseInt(e.target.getAttribute('data-rating'));
            const problemId = e.target.getAttribute('data-problem-id');
            handleDifficultyRating(problemId, rating);
        });
    });
    
    // Add event listener for copy answer LaTeX button
    const copyAnswerBtn = cardDiv.querySelector('.copy-answer-latex-btn');
    if (copyAnswerBtn) {
        copyAnswerBtn.addEventListener('click', (e) => {
            navigator.clipboard.writeText(problem.answer).then(() => {
                e.target.innerHTML = `
                    <svg class="w-3 h-3 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                `;
                e.target.classList.add('bg-green-100', 'dark:bg-green-900', 'text-green-800', 'dark:text-green-200');
                setTimeout(() => {
                    e.target.innerHTML = `
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Answer LaTeX
                    `;
                    e.target.classList.remove('bg-green-100', 'dark:bg-green-900', 'text-green-800', 'dark:text-green-200');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                e.target.innerHTML = `
                    <svg class="w-3 h-3 mr-1 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Failed to copy
                `;
                setTimeout(() => {
                    e.target.innerHTML = `
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Answer LaTeX
                    `;
                }, 2000);
            });
        });
    }
    
    return cardDiv;
}

// --- Show Edit Form ---
function showEditForm(problem, cardDiv) {
    // Create edit form
    const editForm = document.createElement('div');
    editForm.className = "mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700";
    
    editForm.innerHTML = `
        <div class="flex items-center mb-3">
            <svg class="w-4 h-4 text-springer-blue dark:text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <div class="text-sm font-medium dark:text-gray-300 font-serif">Edit Problem</div>
        </div>
        
        <div class="mb-3">
            <label class="block text-xs mb-1 dark:text-gray-400 font-serif">Problem (LaTeX):</label>
            <textarea id="edit-problem-${problem.id}" rows="3" class="springer-input w-full text-sm font-mono">${problem.problem}</textarea>
        </div>
        
        <div class="mb-4">
            <label class="block text-xs mb-1 dark:text-gray-400 font-serif">Answer (LaTeX):</label>
            <textarea id="edit-answer-${problem.id}" rows="2" class="springer-input w-full text-sm font-mono">${problem.answer}</textarea>
        </div>
        
        <div class="flex space-x-2">
            <button id="save-edit-${problem.id}" class="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Save
            </button>
            <button id="cancel-edit-${problem.id}" class="text-xs px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
            </button>
        </div>
    `;
    
    // Replace the problem content with edit form
    const problemDiv = cardDiv.querySelector('.math-display').parentElement;
    const copyBtn = cardDiv.querySelector('button[class*="Copy Problem"]');
    const answerDiv = cardDiv.querySelector('.answer-section');
    
    // Hide the original content
    problemDiv.classList.add('hidden');
    if (copyBtn) copyBtn.classList.add('hidden');
    if (answerDiv) answerDiv.classList.add('hidden');
    
    // Insert edit form after the header
    const headerDiv = cardDiv.querySelector('.flex.justify-between.items-start.mb-4');
    headerDiv.parentNode.insertBefore(editForm, headerDiv.nextSibling);
    
    // Add event listeners
    document.getElementById(`save-edit-${problem.id}`).addEventListener('click', () => {
        const newProblem = document.getElementById(`edit-problem-${problem.id}`).value.trim();
        const newAnswer = document.getElementById(`edit-answer-${problem.id}`).value.trim();
        
        if (newProblem && newAnswer) {
            updateProblem(problem.id, newProblem, newAnswer);
            // Remove edit form and show updated content
            editForm.remove();
            problemDiv.classList.remove('hidden');
            if (copyBtn) copyBtn.classList.remove('hidden');
            
            // Update the displayed problem
            problemDiv.querySelector('.math-display').innerHTML = `\\[ ${newProblem} \\]`;
            if (answerDiv) {
                answerDiv.querySelector('.math-display').innerHTML = `\\[ ${newAnswer} \\]`;
            }
            
            // Refresh MathJax
            if (window.MathJax && window.MathJax.typeset) {
                window.MathJax.typeset();
            }
        } else {
            alert('Both problem and answer are required!');
        }
    });
    
    document.getElementById(`cancel-edit-${problem.id}`).addEventListener('click', () => {
        editForm.remove();
        problemDiv.classList.remove('hidden');
        if (copyBtn) copyBtn.classList.remove('hidden');
        if (answerDiv && !answerDiv.classList.contains('hidden')) {
            answerDiv.classList.remove('hidden');
        }
    });
}

// --- Update Problem ---
async function updateProblem(problemId, newProblem, newAnswer) {
    if (!db || !currentUserId) return;
    
    const problemRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`, problemId);
    
    try {
        await updateDoc(problemRef, {
            problem: newProblem,
            answer: newAnswer
        });
        console.log("Problem updated successfully");
    } catch (error) {
        console.error("Error updating problem:", error);
        alert("Failed to update problem. Please try again.");
    }
}

function getDifficultyLevel(score) {
    if (score < 2.0) return { level: 'easy', text: 'Very Easy' };
    if (score < 3.0) return { level: 'easy', text: 'Easy' };
    if (score < 3.5) return { level: 'medium', text: 'Medium' };
    if (score < 4.0) return { level: 'hard', text: 'Hard' };
    return { level: 'hard', text: 'Very Hard' };
}

// --- Handle Difficulty Rating ---
async function handleDifficultyRating(problemId, rating) {
    if (!db || !currentUserId) {
        alert("Please wait for authentication to complete.");
        return;
    }
    
    const problemRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`, problemId);
    
    try {
        const currentProblem = allProblems.find(p => p.id === problemId);
        if (!currentProblem) return;
        
        const currentRatings = currentProblem.difficultyRatings || {};
        const currentTotalRatings = currentProblem.totalDifficultyRatings || 0;
        const currentEstimated = currentProblem.estimatedDifficulty || 3.0;
        
        // Check if user already rated
        const previousRating = currentRatings[currentUserId] || 0;
        
        // Update ratings
        currentRatings[currentUserId] = rating;
        
        // Calculate new average
        let newTotalRatings = currentTotalRatings;
        let newEstimated;
        
        if (previousRating === 0) {
            // New rating
            newTotalRatings++;
            newEstimated = (currentEstimated * currentTotalRatings + rating) / newTotalRatings;
        } else {
            // Update existing rating
            newEstimated = (currentEstimated * currentTotalRatings - previousRating + rating) / currentTotalRatings;
        }
        
        // Update Firestore
        await updateDoc(problemRef, {
            difficultyRatings: currentRatings,
            totalDifficultyRatings: newTotalRatings,
            estimatedDifficulty: parseFloat(newEstimated.toFixed(2)),
            difficultyScore: parseFloat(newEstimated.toFixed(2))
        });
        
        console.log("Difficulty rating updated successfully");
        
    } catch (error) {
        console.error("Error updating difficulty rating:", error);
        alert("Failed to update rating. Please try again.");
    }
}

// --- Delete Problem ---
confirmDeleteBtn.addEventListener('click', async () => {
    if (!db || !problemToDeleteId) return;
    const problemRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`, problemToDeleteId);
    try {
        await deleteDoc(problemRef);
        deleteModal.classList.add('hidden');
        problemToDeleteId = null;
    } catch (error) {
        console.error("Error deleting problem:", error);
        alert('Failed to delete problem. Please try again.');
    }
});

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    problemToDeleteId = null;
});

// Debug: Check if script is loaded
console.log("Integral Bee platform script loaded successfully!");