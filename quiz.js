const dbAnswers = require('./dbAnswers');
const disambiguate = require('./disambiguate');
const content = require('./content.json');

const cmn = require('./common');
const randomItem = cmn.randomItem;
const randomPhrase = cmn.randomPhrase;

const CORRECT_DING = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_neutral_response_01'/>";
const INCORRECT_BUZZ = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_negative_response_01'/>";
const CONGRATS_JINGLE = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_02'/>";
const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";

const shuffleFactors = function(difficulty) {
  const newArr = [];
  const arr = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].slice(0, difficulty-1);
  while (arr.length) {
    const randomIndex = Math.floor(Math.random() * arr.length),
        element = arr.splice(randomIndex, 1);
    newArr.push(element[0]);       
  }
  return newArr;
};

const promptVariation = function() {
  return randomItem([
    "On {what} do you want me to test you?",
    "On {what} would you like to be tested?",
    "On {what} should we do the test?",
    "{what} do you want me to test you on?",
    "{what} should we do the test for?"
  ]).replace('{what}', randomItem(["What number", "Which number", "Which times table"]));
};

const nextQuestion = async function(getQuestion, session, factor, operand, correct, result, answer) {
  let speak, card, qNext;
  let reprompt = randomPhrase('repromptIntro') + cmn.whatNow('next');

  const difficulty = session.difficulty;
  const levelName = ['easy', 'moderate', 'hard'][(difficulty - 8) / 4];
  
  if (correct)
    session.testShuffle[session.shuffleIndex] = 0;
  else
    session.incorrectAnswers[operand-2]++; // update incorrect count

    if (session.correctAnswers < difficulty-1) {
    do { // skip any correctly replied ones
      if (++session.shuffleIndex > difficulty-2) 
        session.shuffleIndex = 0;      
    } while (session.testShuffle[session.shuffleIndex] == 0);
    operand = session.testShuffle[session.shuffleIndex] * 1;
    qNext = getQuestion(factor, operand, factor*operand, correct, session.useContinous && !session.hint.given, session);
    reprompt = (qNext.hint 
        ? cmn.hintIntro(difficulty, operand, factor)
        : randomPhrase('repromptIntro')
      ) + qNext.reprompt;
    if (qNext.card) 
      card = {
        type: 'standard',
        title: "x " + factor,
        content: qNext.card,
        imageUrl: SMILEY_IMG
      };
  }
  
  // set up answer phrase filter - based on difficulty map
  const score = cmn.getDifficultyMap(difficulty)[factor-2][operand-2];
  const answerFilter = a => a.l <= score;

  if (correct) {
    if (session.correctAnswers == difficulty-1) {
      if (!session.userData[factor]) // create and persist corresponding factor vector if not yet present
        await dbAnswers.answersCreate(session.userData, factor).catch(err => err);
      if (session.testedFactors.indexOf(factor) == -1)
        session.testedFactors.push(factor);
      session.userData[factor].incorrect = session.incorrectAnswers;

      const whichNext = " Which one" + randomItem(content.likeWantShall) + "do next?";
      speak = CONGRATS_JINGLE + `Correct! You've now mastered the ${factor} times table.` + whichNext;
      card = {
        type: 'standard',
        title: "x " + factor,
        content: `Congratulations!\nYou've mastered the ${factor} times table\nat the ${levelName} level. `,
        imageUrl: SMILEY_IMG
      };

      const repromptPhrase = "Which times table" + randomItem(content.likeWantShall) + "take on next?";
      reprompt = randomPhrase('repromptIntro') + repromptPhrase;
      session.action = "test_starting";
      session.factor = null;
      session.lastFactor = factor;
      session.repeat = {
        prompt: `You've just completed the ${factor} times table.` + whichNext,
        reprompt: repromptPhrase
      };

    } else {  // not done yet
      const encouragementSet = session.hint.given ? 'postHintEncouragement' : 'standardEncouragement';
      const encouragement = randomPhrase(encouragementSet, answerFilter);
      const pause = encouragement != ""
        ? (session.hint.given 
          ? "<break time='500ms'/>" 
          : "<break time='300ms'/>")
        : "";
      speak = CORRECT_DING + encouragement + pause + qNext.question;
    }
  } else  // incorrect
    speak = (answer 
              ? INCORRECT_BUZZ + randomPhrase('wrongAnswer', answerFilter)
              : "Well?" )
            + ` it's ${result}.<break time='500ms'/> ${qNext.question}`;

  session.hint.given = false;
  return { speak: speak, card: card, reprompt: reprompt };
};

const handle = async function (handlerInput) {
  const request = handlerInput.requestEnvelope.request;
  let slots = request.intent.slots;
  const sessionAttributes = await cmn.getSession(handlerInput, true);
  if (sessionAttributes.userData[0].streak) { // forgot about paused streak? 
    if (slots && slots.factor && slots.factor.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutPausedStreak('test', handlerInput);
  }
  if (!sessionAttributes.quitStreak && cmn.isGoodStreak()) { // interrupting a good streak
    if (slots && slots.factor && slots.factor.value)
      sessionAttributes.slots = JSON.parse(JSON.stringify(slots));
    return cmn.alertAboutGoodStreak('test', handlerInput);
  }
  const difficulty = sessionAttributes.difficulty;
  
  let reprompt = promptVariation();
  let repromptIntro = cmn.randomPhrase('repromptIntro');
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
    sessionAttributes.action = 'test_starting';
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .addDelegateDirective(request.intent)
      .getResponse();
  }

  // unrecognised dialog reply?
  if (request.dialogState == 'IN_PROGRESS' && factorSlot.value == '?')
    return disambiguate.getResponse(handlerInput);

  const answerSlot = slots ? slots.result : null;
  // assume factor can be retrieved from session
  let factor = sessionAttributes.factor;
  // slot can be either factor or result (answer)
  if (factorSlot && factorSlot.value) 
    factor = factorSlot.value*1;
  else if (answerSlot && answerSlot.value) 
    factor =  answerSlot.value*1;

  sessionAttributes.action = 'test_starting';
  if (!sessionAttributes.stories)
    sessionAttributes.stories = { used: [] };
  sessionAttributes.stories.postComment = null;  
  sessionAttributes.stories.countDown = Math.floor(Math.random()*3+2) + (difficulty-8)/4;

  const reply = { intro: intro };
  if (!factor) {
    // after redirecting from Yes and Repeat intents
    reply.prompt = promptVariation();
    sessionAttributes.disambiguate = null;
  } else if (!cmn.invalidFactor(factor, difficulty, reply)) {
    sessionAttributes.action = 'test';
    sessionAttributes.factor = factor;
    sessionAttributes.testShuffle = shuffleFactors(difficulty);
    sessionAttributes.shuffleIndex = 0;
    sessionAttributes.correctAnswers = 0;
    sessionAttributes.division = false;
    sessionAttributes.disambiguate = null;
    sessionAttributes.secondChance = false;
    sessionAttributes.hint = { given: false };
    sessionAttributes.incorrectAnswers = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    const operand =  sessionAttributes.testShuffle[0];
    reply.intro += randomItem(["Let's begin. ", "Let's start. ", "Here we go. "]);
    reply.prompt = cmn.formatQuestion(false, q => q.opening, factor, operand);

    const hint = cmn.giveHint(operand, factor, null, false);
    reprompt = hint ? hint : cmn.formatQuestion(false, q => q.opening, factor, operand);
    if (hint)
      repromptIntro = cmn.hintIntro(difficulty, operand, factor);
    sessionAttributes.repeat.question = {
      prompt: reply.prompt,
      reprompt: reprompt,
      hint: hint != ""
    };
    
  } // else cmn.invalidaFactor will provide reply

  sessionAttributes.repeat.prompt = reply.prompt;
  sessionAttributes.repeat.reprompt = reprompt;
  sessionAttributes.useContinous = false;

  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  return handlerInput.responseBuilder
    .speak(reply.intro + reply.prompt)
    .reprompt(repromptIntro + reprompt)
    .getResponse();
};

const QuizHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
      && request.intent.name === 'QuizIntent');
    }, handle,
    nextQuestion
  };
    
module.exports = QuizHandler;