# Tennis Bot V2 — שלב ראשון

החבילה כוללת:

- `knowledge/academyKnowledge.js` — כל המידע העסקי במקום אחד.
- `prompts/systemPrompt.js` — הנחיות קצרות וחזקות ל-AI.
- `utils/intentClassifier.js` — זיהוי שאלות נפוצות.
- `services/faqService.js` — תשובות מוכנות ומדויקות.
- `services/responseService.js` — החלטה אם לענות אוטומטית או לשלוח ל-OpenAI.
- `integrationExample.js` — דוגמת שילוב בקוד הקיים.

## התקנה

העתק את התיקיות והקבצים לפרויקט.

בתוך `webhookController.js`, לפני הקריאה ל-OpenAI:

```js
const { getAutomatedResponse } = require("../services/responseService");

const automated = getAutomatedResponse(messageText, userProfile);

if (automated.handled) {
  return automated.response;
}
```

רק אם `handled` הוא false, המשך לקריאה הקיימת ל-OpenAI.

## חשוב

המספר הפנימי של המנהל לא נמצא באף קובץ בחבילה.
המספר הרשמי היחיד שמותר לבוט למסור הוא:

0559113235
