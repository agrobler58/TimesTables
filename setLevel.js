const cmn = require('./common');
const whatNow =cmn.whatNow;
const content = require('./content.json');

const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";

const promptVariation = function() {
  return cmn.randomItem([
    "Which difficulty level would you like to switch to. You can choose between easy, moderate or hard.",
    "Difficulty levels are, easy, moderate, and hard. Which one do you want to change to?"
  ]);
};

const handle = async function(handlerInput) {
  let speak, card, reprompt, repeat;
  const request = handlerInput.requestEnvelope.request;
  let slots = request.intent.slots;
  const sessionAttributes = await cmn.getSession(handlerInput, true);
  if (sessionAttributes.userData[0].streak) { // forgot about paused streak?
    if (slots && slots.difficulty && slots.difficulty.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutPausedStreak('level', handlerInput);
  }
  if (!sessionAttributes.quitStreak && cmn.isGoodStreak()) { // interrupting a good streak
    if (slots && slots.difficulty && slots.difficulty.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutGoodStreak('level', handlerInput);
  }
  //when denied go back to original intent
  if (request.dialogState == 'IN_PROGRESS' && request.intent.confirmationStatus == 'DENIED') {
    const prompt = sessionAttributes.repeat.question.prompt;
    const reprompt = sessionAttributes.repeat.question.reprompt;
    const repromptIntro = sessionAttributes.repeat.question.hint ? cmn.hintIntro() : cmn.randomPhrase('repromptIntro');
    sessionAttributes.disambiguation = null;
    sessionAttributes.useContinous = false;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(cmn.randomItem(["Ok. ", "No worries. ", "Sure. ", "No problem. "]) + prompt)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  }
  //confirm changing level if in the middle of quiz or streak
  if (request.dialogState == 'STARTED' && ['test', 'streak'].includes(sessionAttributes.action)) {
    const difficultySlot = slots ? slots.difficulty : null;
    if (difficultySlot && difficultySlot.value) 
      return handlerInput.responseBuilder
      .addDelegateDirective(request.intent)
      .getResponse();
  }

  sessionAttributes.action = 'level_change';
  const currentDifficulty = sessionAttributes.difficulty;
  const currentLevel = ['easy', 'moderate', 'hard'][(currentDifficulty-8)/4];
  repeat = `<p>At the moment you're on the ${currentLevel} level.</p> <p>Which one would you like to change to?</p>`;
  reprompt = "Which level" + cmn.randomItem(content.likeWantShall) + "change to?";

  let intro = cmn.randomItem(['Ok. ', 'Cool. ']);
  if (sessionAttributes.promptIntro) {
    intro = sessionAttributes.promptIntro;
    delete sessionAttributes.promptIntro;
  }

  if (sessionAttributes.slots) {
    slots = JSON.parse(JSON.stringify(sessionAttributes.slots));
    delete sessionAttributes.slots;
  }
  const difficultySlot = slots ? slots.difficulty : null;
  if (difficultySlot && !difficultySlot.value) {
    sessionAttributes.repeat = { 
      prompt: repeat, 
      reprompt: reprompt 
    };
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .addDelegateDirective(request.intent)
      .getResponse();
  }

  // unrecognised dialog reply?
  if (request.dialogState == 'IN_PROGRESS' && difficultySlot.value == '?')
    return cmn.disambiguate.getResponse(handlerInput);

  if (!difficultySlot) {
    repeat = promptVariation();
    reprompt = promptVariation();
    speak = repeat;
  } else {
    const difficultySlotValues = difficultySlot ? difficultySlot.resolutions.resolutionsPerAuthority[0].values : null;
    let newDifficulty = difficultySlotValues ? difficultySlotValues[0].value.id*1 : null;
    const obtainedValue = difficultySlot ? difficultySlot.value : 'this';
    if (!newDifficulty) {
      repeat = "You did not provide a valid difficulty level. Please use: easy, moderate, or hard."; 
      speak = `Sorry, ${obtainedValue} is not a valid difficulty level. Please use: easy, moderate, or hard.`;
    } else {
      reprompt = whatNow();
      const newDifficultyName = difficultySlot.value.toUpperCase();
      if (newDifficulty !== currentDifficulty) {
        sessionAttributes.difficulty = newDifficulty;
        sessionAttributes.userData[0].level = newDifficulty;
        sessionAttributes.action = null;
        sessionAttributes.factor = null;
        sessionAttributes.useContinous = false;
        sessionAttributes.disambiguate = null;

        repeat = `You are now at the level ${newDifficultyName}, with times tables of up to ${newDifficulty}. ` + whatNow('now');
        speak = intro + repeat;
        card = {
          type: 'standard',
          title: 'Level ' + newDifficultyName[0] + newDifficultyName.substring(1).toLowerCase(),
          content: `You've switched to the ${newDifficultyName.toLowerCase()} level, with times tables of up to ${newDifficulty} by ${newDifficulty}. `,
          imageUrl: SMILEY_IMG
        };
      } else {
        speak = "You're already at that level. " + whatNow();
        repeat = `You're already at level ${newDifficultyName}. ` + whatNow();
      }
    }
  }
  sessionAttributes.repeat = {
    prompt: repeat,
    reprompt: reprompt
  };

  const repromptIntro = cmn.randomPhrase('repromptIntro');
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  let builder = handlerInput.responseBuilder
    .speak(speak)
    .reprompt(repromptIntro + reprompt);
  if (card)
    builder = builder.withStandardCard(card.title, card.content, card.imageUrl+'_small.png', card.imageUrl+'_large.png');
  return builder.getResponse();
};

const SetLevelHandler = {
  canHandle(handlerInput) {
      const request = handlerInput.requestEnvelope.request;
      return (request.type === 'IntentRequest'
          && request.intent.name === 'SetLevelIntent');
  }, handle
};

module.exports = SetLevelHandler;