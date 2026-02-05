let currentIndex = 0;
let isRunning = false;
let currentTimeout = null;
let waitTimer = null;

document.getElementById("startBtn").onclick = startAssistant;
document.getElementById("stopBtn").onclick = stopAssistant;

async function startAssistant() {
  if (isRunning) return;
  
  isRunning = true;
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;
  document.getElementById("status").innerText = "Loading questions...";

  try {
    const res = await fetch("config/questions.json");
    QUESTIONS = await res.json();
    runLoop();
  } catch (error) {
    document.getElementById("status").innerText = "Error loading questions";
    stopAssistant();
  }
}

function stopAssistant() {
  isRunning = false;
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("status").innerText = "Stopped";
  document.getElementById("timer").innerText = "";
  document.getElementById("currentQuestion").innerText = "";
  document.getElementById("userResponse").innerText = "";
  
  if (currentTimeout) {
    clearTimeout(currentTimeout);
    currentTimeout = null;
  }
  
  if (waitTimer) {
    clearInterval(waitTimer);
    waitTimer = null;
  }
  
  // Stop any ongoing speech
  speechSynthesis.cancel();
  
  // Stop any ongoing recognition
  try {
    recognition.stop();
  } catch (e) {
    // Ignore error if recognition is not running
  }
}

async function runLoop() {
  while (isRunning) {
    // Process all questions in one cycle
    for (let i = 0; i < QUESTIONS.length && isRunning; i++) {
      currentIndex = i;
      const q = QUESTIONS[currentIndex];
      
      document.getElementById("currentQuestion").innerText = `Question: ${q.question}`;
      document.getElementById("status").innerText = "Asking question...";
      await speak(q.question);

      if (!isRunning) break;

      // Try up to 3 times to get a response
      let userAnswer = null;
      let attemptCount = 0;
      const maxAttempts = 3;

      while (attemptCount < maxAttempts && !userAnswer && isRunning) {
        attemptCount++;
        
        if (attemptCount > 1) {
          document.getElementById("status").innerText = `No response detected. Attempt ${attemptCount} of ${maxAttempts}...`;
          await speak(q.question);
          if (!isRunning) break;
        }

        document.getElementById("status").innerText = "Listening...";
        
        try {
          userAnswer = await listenWithTimeout(8000); // 8 second timeout
        } catch (error) {
          if (error.message === "timeout") {
            console.log(`Attempt ${attemptCount}: Timeout - no response in 8 seconds`);
            userAnswer = null;
          } else if (error.message === "stopped") {
            break;
          }
        }
      }

      if (!isRunning) break;

      // If we got an answer, process it
      if (userAnswer) {
        document.getElementById("userResponse").innerText = `Your answer: ${userAnswer}`;
        document.getElementById("status").innerText = "Understanding...";
        const correct = await checkMeaning(userAnswer, q.answer, q.question);

        if (!isRunning) break;

        if (correct) {
          const correctResponses = [
            "That is correct",
            "Excellent",
            "Well done",
            "Perfect",
            "You got it right",
            "That's right",
            "Correct",
            "Great job",
            "Absolutely right"
          ];
          const randomCorrect = correctResponses[Math.floor(Math.random() * correctResponses.length)];
          await speak(randomCorrect);
        } else {
          const incorrectIntros = [
            "Not quite.",
            "Close, but",
            "Almost.",
            "Not exactly.",
            "Good try, but"
          ];
          const randomIntro = incorrectIntros[Math.floor(Math.random() * incorrectIntros.length)];
          await speak(`${randomIntro} The correct answer is ${q.answer}`);
        }
      } else {
        // No response after 3 attempts, move to next question
        document.getElementById("status").innerText = "No response received. Moving to next question...";
        document.getElementById("userResponse").innerText = "No response detected";
        await speak("No response received. Moving to next question.");
      }

      if (!isRunning) break;
      
      // Small pause between questions
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!isRunning) break;

    // Wait 10 minutes before next cycle
    document.getElementById("status").innerText = "Cycle complete. Waiting 10 minutes...";
    document.getElementById("currentQuestion").innerText = "";
    document.getElementById("userResponse").innerText = "";
    
    await waitWithCountdown(600); // 600 seconds = 10 minutes
    
    if (!isRunning) break;
  }
}

function waitWithCountdown(seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    
    const updateTimer = () => {
      if (!isRunning) {
        clearInterval(waitTimer);
        resolve();
        return;
      }
      
      const minutes = Math.floor(remaining / 60);
      const secs = remaining % 60;
      document.getElementById("timer").innerText = `Next cycle in: ${minutes}:${secs.toString().padStart(2, '0')}`;
      
      remaining--;
      
      if (remaining < 0) {
        clearInterval(waitTimer);
        document.getElementById("timer").innerText = "";
        resolve();
      }
    };
    
    updateTimer();
    waitTimer = setInterval(updateTimer, 1000);
  });
}

function listenWithTimeout(timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          recognition.stop();
        } catch (e) {
          // Ignore error
        }
        reject(new Error("timeout"));
      }
    }, timeoutMs);
    
    currentTimeout = timeout;
    
    recognition.start();
    
    recognition.onresult = (event) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        currentTimeout = null;
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      }
    };
    
    recognition.onerror = (event) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        currentTimeout = null;
        
        if (!isRunning) {
          reject(new Error("stopped"));
        } else if (event.error === "no-speech") {
          reject(new Error("timeout"));
        } else {
          reject(new Error(event.error));
        }
      }
    };
    
    recognition.onend = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        currentTimeout = null;
        reject(new Error("timeout"));
      }
    };
  });
}

async function checkMeaning(userAnswer, correctAnswer, question) {
  const systemPrompt = `You are an intelligent and lenient answer evaluator for spoken responses.

Your task is to determine if a user's spoken answer conveys the same core meaning and intent as the expected answer, even if expressed differently.

EVALUATION PRINCIPLES:
1. Focus on SEMANTIC MEANING, not exact wording
2. Be LENIENT with:
   - Grammar mistakes and pronunciation errors
   - Different sentence structures
   - Filler words ("um", "like", "you know", "I think", "basically", etc.)
   - Articles (a, an, the)
   - Word order variations
   - Synonyms and paraphrasing
   - Casual vs formal language

3. Accept answers that:
   - Contain the key concepts from the expected answer
   - Explain the answer in the user's own words
   - Use everyday language to express the same idea
   - Include extra explanation or context
   - Use different but equivalent terminology

4. For different question types:
   - DEFINITIONS: Accept any explanation that captures the core meaning
   - ACRONYMS: Accept if all key words are mentioned (order flexible unless critical)
   - LOCATIONS: Accept synonyms (above/over/on top, below/under/beneath, next to/beside/near)
   - FACTS: Accept paraphrased versions with same factual content
   - PROCEDURES: Accept reordered steps if sequence isn't critical

5. SPECIAL CASE - CBBT:
   - If question asks "What does CBBT mean?"
   - The correct sequence MUST be: Cupboard → Bench → Bathroom → Table
   - User may say it in sentence form or list form
   - Extra words are allowed
   - But the ORDER must be preserved: Cupboard, Bench, Bathroom, Table
   - If order is wrong (e.g., Bench, Cupboard, Bathroom, Table), answer is INCORRECT

6. Reject only if:
   - The core meaning is fundamentally different
   - Key factual elements are missing or incorrect
   - The answer contradicts the expected answer
   - For CBBT: if the sequence order is wrong

Respond with ONLY:
yes (if intent and meaning match)
or
no (if fundamentally different)`;

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Question: ${question}

Expected answer: ${correctAnswer}

User's spoken answer: ${userAnswer}

Does the user's answer convey the same core meaning and intent as the expected answer?`
        }
      ],
      temperature: 0.3
    })
  });

  const data = await response.json();
  const reply = data.choices[0].message.content.toLowerCase().trim();

  return reply.includes("yes");
}