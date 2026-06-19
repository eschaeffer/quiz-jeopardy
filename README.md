# Jeopardy! Review Game

A static, browser-based Jeopardy game for classroom review sessions.

## Features

- **Classic Jeopardy styling** with the iconic blue board and yellow text
- **JSON data import** for custom questions/answers
- **Multiple teams** (2+ participants)
- **Two rounds**: Jeopardy + Double Jeopardy + Final Jeopardy
- **Configurable timer** with visual countdown bar
- **Standard scoring**: correct adds points, incorrect deducts points
- **Animated question reveals** with fade-in effects
- **Extensible architecture** ready for Daily Doubles

## Quick Start

1. Open `index.html` in any modern browser
2. Either click **Load Sample Data** or upload your own JSON file
3. Add/remove teams as needed
4. Configure timer settings
5. Click **Start Game**

## JSON Data Format

Create a JSON file with this structure:

```json
{
  "rounds": [
    {
      "name": "JEOPARDY!",
      "categories": [
        {
          "name": "Category Name",
          "questions": [
            { "value": 200, "question": "Question text?", "answer": "Answer" },
            { "value": 400, "question": "Question text?", "answer": "Answer" },
            { "value": 600, "question": "Question text?", "answer": "Answer" },
            { "value": 800, "question": "Question text?", "answer": "Answer" },
            { "value": 1000, "question": "Question text?", "answer": "Answer" }
          ]
        }
      ]
    },
    {
      "name": "DOUBLE JEOPARDY!",
      "categories": [
        {
          "name": "Category Name",
          "questions": [
            { "value": 400, "question": "Question text?", "answer": "Answer" },
            { "value": 800, "question": "Question text?", "answer": "Answer" },
            { "value": 1200, "question": "Question text?", "answer": "Answer" },
            { "value": 1600, "question": "Question text?", "answer": "Answer" },
            { "value": 2000, "question": "Question text?", "answer": "Answer" }
          ]
        }
      ]
    }
  ],
  "finalJeopardy": {
    "category": "Category Name",
    "clue": "The clue text",
    "answer": "The answer"
  }
}
```

### Required Fields

- `rounds`: Array of round objects
  - `name`: Display name for the round
  - `categories`: Array of category objects
    - `name`: Category display name
    - `questions`: Array of question objects
      - `value`: Point value (number)
      - `question`: The question/clue text
      - `answer`: The correct answer
- `finalJeopardy` (optional): Final Jeopardy round
  - `category`: Category name
  - `clue`: The clue text
  - `answer`: The correct answer

### Future: Daily Double Support

Questions can optionally include `"isDailyDouble": true` for future Daily Double functionality.

## Game Flow

1. **Setup**: Import data, configure teams and settings
2. **Round Play**: Click tiles to reveal questions, answer within timer, score teams
3. **Final Jeopardy**: Teams place wagers, clue is revealed, score responses
4. **Results**: Final scores displayed with winner announcement

## Hosting

This is a fully static site - just serve the files from any web server or open `index.html` directly.

## Files

- `index.html` - Game interface
- `styles.css` - Classic Jeopardy styling
- `game.js` - Game logic
- `sample-data.json` - Example question data
