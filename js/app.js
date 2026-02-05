let currentIndex = 0;

document.getElementById("startBtn").onclick = startAssistant;

async function startAssistant() {
  document.getElementById("status").innerText = "Loading questions...";

  const res = await fetch("config/questions.json");
  QUESTIONS = await res.json();

  runLoop();
}

async function runLoop() {
  while (true) {
    const q = QUESTIONS[currentIndex];

    document.getElementById("status").innerText = "Asking question...";
    await speak(q.question);

    document.getElementById("status").innerText = "Listening...";
    const userAnswer = await listen();

    document.getElementById("status").innerText = "Understanding...";
    const correct = await checkMeaning(userAnswer, q.answer, q.question);

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

    currentIndex = (currentIndex + 1) % QUESTIONS.length;
  }
}

async function checkMeaning(userAnswer, correctAnswer, question) {

  const systemPrompt = `You are an intelligent examiner.

  You will be given:
  - A question
  - The expected correct answer
  - A user's spoken answer
  
  Your task:
  Determine whether the user's answer has the SAME INTENT and MEANING
  as the expected correct answer.
  
  General rules (apply to ALL questions):
  - Ignore grammar mistakes
  - Ignore sentence structure differences
  - Ignore filler words like "means", "is", "the", "and"
  - Do NOT require exact wording
  - Decide strictly by intent and meaning
  
  IMPORTANT SPECIAL RULE — CBBT:
  - If the question is "What does CBBT mean?"
  - The correct sequence MUST be:
    Cupboard → Bench → Bathroom → Table
  - The user may answer in sentence or list form
  - Extra words are allowed
  - If the order is changed or jumbled, the answer is INCORRECT
  
  For all OTHER questions (location / relationship):
  - The user may describe the answer naturally
  - Synonyms are allowed (below = under, next to = beside)
  - Relative positions are allowed (after, near, beside)
  - Order does NOT apply unless explicitly stated in the answer
  
  Decision rule:
  - If the user's intent matches the expected answer → reply "yes"
  - Otherwise → reply "no"
  
  Reply ONLY with:
  yes
  or
  no`;

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