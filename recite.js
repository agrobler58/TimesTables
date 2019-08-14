const disambiguate = require('./disambiguate');

const cmn = require('./common');
const randomItem = cmn.randomItem;

const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";

const reciteString = function(factor, scope) {
  let s = "Skip count: ";
  for (let i = 0; i < scope-1; i++) {
    s = s + (i+1) * factor + ', ';
  }
  return s + ' and ' + scope * factor + "\n(for the " + ['easy', 'moderate', 'hard'][(scope-8)/4] + " level.)";
};

const reciteTimesTable = function(factor, scope) {
  let s = '<prosody rate="slow"><break time="500ms"/>';
  for (let i = 0; i < scope-1; i++) {
    s = s + (i+1) * factor + ',<break time="300ms"/> ';
  }
  return s + ' and ' + scope * factor + '.</prosody><break time="500ms"/> This was the times table of ' + factor;
};

const promptVariation = function() {
  return randomItem([
    "{what} do you want me to recite?",
    "{what} should we chant?",
    "{what} should we recite?",
    "{what} would you like me to recite?"
  ]).replace('{what}', randomItem(["What number", "Which number", "Which times table"]));
};

const handle = async function(handlerInput) {
  const request = handlerInput.requestEnvelope.request;
  let slots = request.intent.slots;
  const sessionAttributes = await cmn.getSession(handlerInput, true);
  if (sessionAttributes.userData[0].streak) { // forgot about paused streak?
    if (slots && slots.factor && slots.factor.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutPausedStreak('recite', handlerInput);
  }
  if (!sessionAttributes.quitStreak && cmn.isGoodStreak()) { // interrupting a good streak
    if (slots && slots.factor && slots.factor.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutGoodStreak('recite', handlerInput);
  }
  const difficulty = sessionAttributes.difficulty;
  
  let reprompt = promptVariation();
  sessionAttributes.repeat = {
    prompt: promptVariation(),
    reprompt: reprompt
  };

  let intro = randomItem(['Ok. ', 'Great. ', 'Cool. ', 'Awesome. ']);
  if (sessionAttributes.promptIntro) {
    intro = sessionAttributes.promptIntro;
    delete sessionAttributes.promptIntro;
  }

  if (sessionAttributes.slots) {
    slots = JSON.parse(JSON.stringify(sessionAttributes.slots));
    delete sessionAttributes.slots;
  }
  const factorSlot = slots ? slots.factor : null;
  if (factorSlot && !factorSlot.value && !sessionAttributes.factor) {
    sessionAttributes.action = 'recite_starting';
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .addDelegateDirective(request.intent)
      .getResponse();
  }

  // unrecognised dialog reply?
  if (request.dialogState == 'IN_PROGRESS' && factorSlot.value == '?') 
    return disambiguate.getResponse(handlerInput);

  const answerSlot = slots ? slots.result : null;
  // assume factor can be extracted from session
  let factor = sessionAttributes.factor;
  // slot can be either factor or result (answer)
  if (factorSlot && factorSlot.value)
    factor = factorSlot.value*1;
  else if (answerSlot && answerSlot.value)
    factor =  answerSlot.value*1;
  const sameFactor = factor == sessionAttributes.factor;

  sessionAttributes.action = 'recite_starting';
  const reply = { intro: intro };
  if (!factor) {
    // after redirecting from another intent
    reply.prompt = reprompt;
    sessionAttributes.disambiguate = null;
  } else if (!cmn.invalidFactor(factor, difficulty, reply)) {
    sessionAttributes.action = 'recite';
    sessionAttributes.factor = factor;
    sessionAttributes.disambiguate = null;
    let reciteTerm = 'recite';
    if (slots && slots.recite && slots.recite.value != 'reciting') {
      reciteTerm = slots.recite.value;
      if (!reciteTerm) 
        reciteTerm = slots.recite.name;
    }
    if (sameFactor && sessionAttributes.action == 'recite')
      reply.intro = randomItem(["Of course, ", "Sure, ", "No problem. ", "All right, "]);
    const together = randomItem(["", "let's "]);
      reply.prompt = together + reciteTerm 
      + (together ? " together: " : randomItem([" along: ", " with me: "]))
      + reciteTimesTable(factor, difficulty) 
      + "<break time='400ms'/> "
      + randomItem(["Should we repeat? ", "Want to go again?", "Would you like me to repeat?"])
      + randomItem(["Or do you want me to test you", "Or can we do a test", "Or is it time to do a test"]);
    reply.card = {
      type: 'standard',
      title: "x " + factor,
      content: reciteString(factor, difficulty),
      imageUrl: SMILEY_IMG
    };
    reprompt = "Do you want me to repeat the " + factor + " times table, or do a test on it";
  } // else cmn.invalidFactor will provide reply

  sessionAttributes.repeat = {
    prompt: reply.prompt,
    reprompt: reprompt
  };
  sessionAttributes.useContinous = false;

  const repromptIntro = cmn.randomPhrase('repromptIntro');
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  let builder = handlerInput.responseBuilder
    .speak(reply.intro + reply.prompt)
    .reprompt(repromptIntro + reprompt);
  if (reply.card)
    builder = builder.withStandardCard(reply.card.title, reply.card.content, reply.card.imageUrl+'_small.png', reply.card.imageUrl+'_large.png');
  return builder.getResponse();
};

const ReciteHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
      && request.intent.name === 'ReciteIntent');
  }, handle
};

module.exports = ReciteHandler;