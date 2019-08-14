const cmn = require('./common');
const content = require('./content.json');

const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";
const EXPLAIN = {
  recite: "Reciting helps you memorize individual times tables, by listening and skip counting along with me, "
    + "for example, 4, 8, 12, 16, and so on, until you're feeling confident to take a test.",
  test: "<p>In a test, I'll give you a series of random questions for a times table, and validate your responses. "
    + "For example, what is 3 times 4, 7 times 4, or 16 divided by 4, and so on. </p>"
    + "<p>During the test I'll remember the incorrect answers, and repeat the questions until you get all correct.</p> <p>Kind of like a game of flash cards.</p>",
  streak: "<p>Once you feel pretty confident with all the times tables of your current level, you can try the streak challenge. </p>"
    + "<p>I'll be asking you questions and we'll see how many you can get right in a row. The streak breaks with the first incorrect answer.</p>"
    + "<p>Each correct answer however, earns you points, based on the difficulty of the question. As you progress, "
    + "I'll keep a total score.</p> <p>I also keep your personal best across multiple sessions, and will congratulate you every time you beat it. </p>"
    + "<p>In case you need to pause the streak, just say pause, and it will resume next time you start the skill.</p>",
  hint: "<p>If you get stuck in a test or during a streak, just ask for help. </p><p>I'll try to give you a hint, which may help you in finding the correct answer.</p>"
    + "<p>When doing a streak challenge, you're allowed up to three hints. </p>",
  level: "<p>Times tables can go up to 16 by 16, which is the top, hard level. </p>"
    + "<p>You begin at the easy level with tables of up to 8 by 8, while the middle level is called moderate, with tables of up to 12 by 12. </p>"
    + "<p>You can change the difficulty level at any time, by saying for example, set level to moderate.</p>",
  meaning: "<p>Huh. That's easy. It's 42.</p><p>Everyone knows that.</p>"
    + "<p>And you can get it by multiplying 7 by 6, or 14 by 3.</p>",
  NO_MATCH: "Sorry, times tables can't help you with that."
};
const explainTitles = { recite: "Reciting", test: "Tests", streak: "the Streak", hint: "Hints", level: "Levels" };
const explainRepeat = "<p>You can ask me for more information on reciting, test, streak challenge, hints, and difficulty levels. </p>"
  + "<p>Just say for example, explain reciting, or, what's a streak. </p>" 
  + "<p>What would you like to do?</p>";

// -- Easter egg #1
const meaningRepeat = "<p>According to Douglas Adams, The answer to the meaning of life, universe and everything; is 42.</p>" +
  "<p>And you can get it by multiplying 7 by 6, or 14 by 3.</p>";
const askingForMeaning = function(phrase) {
  return phrase && (phrase.indexOf('life') != -1 || phrase.indexOf('universe') != -1 || phrase.indexOf('everything') != -1);
};

const handle = async function(handlerInput) {
  const request = handlerInput.requestEnvelope.request;
  const sessionAttributes = await cmn.getSession(handlerInput);
  sessionAttributes.repeat = sessionAttributes.repeat || {};

  const slots = request.intent.slots;
  const topicSlot = slots ? slots.topic : null;
  let topic = topicSlot && askingForMeaning(topicSlot.value) ? 'meaning' : cmn.resolveSlotValue(topicSlot);
  if (!topic) {
    // see if we can determine topic from the session
    if (['recite_starting', 'test_starting', 'level_change'].includes(sessionAttributes.action)) 
      topic = 'level';
    else if (sessionAttributes.action && sessionAttributes.action.split('|')[0] == 'streak_quit')
      topic = 'streak';
    else {
      sessionAttributes.repeat.prompt = explainRepeat;
      sessionAttributes.repeat.reprompt = cmn.whatNow();
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return handlerInput.responseBuilder
        .addDelegateDirective(request.intent)
        .getResponse();
    }
  }

  if (!EXPLAIN[topic]) topic = 'NO_MATCH';
  const explanation = EXPLAIN[topic];
  const repeat = topic == 'meaning' ? meaningRepeat : EXPLAIN[topic];
  let card;
  let reprompt = sessionAttributes.repeat.reprompt ? sessionAttributes.repeat.reprompt : cmn.whatNow('now');
  switch (sessionAttributes.action) {
    case 'test':
      sessionAttributes.action = "test_continue";
    case 'test_continue':
      reprompt = cmn.randomItem(content.likeWantShall) + `continue your test of the times table of ${sessionAttributes.factor}?`;
      break;
    case 'streak_quit|stop': case 'streak_quit|cancel': 
    case 'streak_quit|test': case 'streak_quit|recite': case 'streak_quit|level': 
      delete sessionAttributes.quitStreak;
    case 'streak':
      sessionAttributes.action = "streak_continue";
    case 'streak_continue':
      reprompt = cmn.randomItem(content.likeWantShall) + "go on with your streak?";
      break;
    case null:
    case undefined:
      if (['recite', 'test', 'streak'].includes(topic)) {
        sessionAttributes.action = topic + "_launch";
        reprompt = "Would you like to try it out?";
      }
      break;
  }

  if (topic != 'NO_MATCH') {
    sessionAttributes.repeat.prompt = repeat + reprompt;
    sessionAttributes.repeat.reprompt = reprompt;
    if (topic != 'meaning') 
      card = {
        type: 'standard',
        title: `About ${explainTitles[topic]}`,
        content: explanation.replace(/<\/p>/g, '\n').replace(/<[^>]*>/g, ''), //+ "More information at http://bit.ly/ttstreak",
        imageUrl: SMILEY_IMG
      };
  }
  
  sessionAttributes.disambiguate = null;  
  sessionAttributes.useContinous = false;
  const repromptIntro = cmn.randomPhrase('repromptIntro');
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  let builder = handlerInput.responseBuilder
    .speak(explanation + "<break time='400ms'/> " + reprompt)
    .reprompt(repromptIntro + reprompt);
  if (card)
    builder = builder.withStandardCard(card.title, card.content, card.imageUrl+'_small.png', card.imageUrl+'_large.png');
  return builder.getResponse();
};

const ExplainHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
      && request.intent.name === 'ExplainIntent');
  }, handle
};

module.exports = ExplainHandler;