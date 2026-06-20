# Classroom Trivia Showdown

A static, browser-based trivia game for classroom review sessions.

## Features

- **Original visual identity** with coordinated category colors and modern design
- **JSON data import** for custom questions/answers
- **Multiple teams** (2+ participants)
- **Two rounds** with increasing point values + Final Showdown
- **Configurable timer** with visual countdown bar
- **Standard scoring**: correct adds points, incorrect deducts points
- **Animated question reveals** with fade-in effects
- **Bonus Questions** with team selection and wager-based scoring
- **Phone buzzers** via MQTT for real-time student participation
- **Teacher mobile control** for managing the game from a phone or tablet
- **Sound effects** via Web Audio API (no external files)

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
      "name": "Round 1",
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
      "name": "Round 2",
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
  "finalShowdown": {
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
- `finalShowdown` (optional): Final round
  - `category`: Category name
  - `clue`: The clue text
  - `answer`: The correct answer

### Bonus Questions

Questions can include `"isBonusQuestion": true` to trigger the Bonus Question flow with team selection and wager-based scoring.

## Game Flow

1. **Setup**: Import data, configure teams and settings
2. **Round Play**: Click tiles to reveal questions, answer within timer, score teams
3. **Final Showdown**: Teams place wagers, clue is revealed, score responses
4. **Results**: Final scores displayed with winner announcement

## Hosting

This is a fully static site - just serve the files from any web server or open `index.html` directly.

## Files

- `index.html` - Game interface
- `styles.css` - Visual design and styling
- `game.js` - Game logic
- `sound-effects.js` - Web Audio API sound effects
- `buzzer.html` / `buzzer-client.js` - Student phone buzzer interface
- `control.html` / `control.js` / `control.css` - Teacher mobile control
- `sample-data.json` - Example question data
