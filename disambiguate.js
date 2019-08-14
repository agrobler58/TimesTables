const content = require('./content.json');

const cmn = require('./common');
const randomItem = cmn.randomItem;
const randomPhrase = cmn.randomPhrase;

exports.getResponse = async function(handlerInput){
  const session = await cmn.getSession(handlerInput, true);

  let lastPrompt, actionChange, skip; 
  let closingType = 'closingAsNo';

  switch (session.action) {
    case 'recite_launch':
      skip = true;
      lastPrompt = "Do you want to try out reciting a times table?";
      break;
    case 'recite_starting':
      actionChange = 'recite_launch';
      lastPrompt = "Do you still want to do reciting?";
      break;
    case 'recite':
      closingType = 'closingAsNone';
      skip = true;
      lastPrompt = session.repeat.reprompt;
      break;
    case 'test_launch':
      skip = true;
      lastPrompt = "Do you want to try out a test?";
      break;
    case 'test_starting':
      actionChange = 'test_launch';
      lastPrompt = "Do you still want to do a test?";
      break;
    case 'test_continue':
      skip = true;
    case 'test':
      lastPrompt = `Do you still want to continue with your ${session.factor} times table test?`;
      actionChange = 'test_continue';
      break;
    case 'streak_launch':
      skip = true;
      lastPrompt = "Do you want to try out a streak challenge?";
      break;
    case 'streak_continue':
      skip = true;
    case 'streak':
      lastPrompt = "Do you still want to go on with your streak?";
      actionChange = 'streak_continue';
      break;
    default:
      closingType = 'closingAsNone';
      skip = true;
      lastPrompt = "To learn how to use the skill, just say help, at any time. " + cmn.whatNow('then');
      break;
  }

  const getPrompt = (session, t, d) => session.repeat ? (session.repeat.question ? session.repeat.question[t] : session.repeat[t]) : d;
  let repeatPrompt = getPrompt(session, 'prompt', cmn.whatNow());
  let reprompt = getPrompt(session, 'reprompt', cmn.whatNow('then'));

  switch (session.disambiguate) {
    case undefined:
    case null:
      session.disambiguate = skip ? 'second' : 'first';
      prompt = randomPhrase('sayAgain');
      break;
    case 'first':
      session.disambiguate = 'second';
      prompt = randomPhrase('whatDoYouMean') + repeatPrompt;
      break;
    case 'second':
      session.disambiguate = 'last';
      if (actionChange)
        session.action = actionChange;
      prompt = randomPhrase('whatDoYouMean') + lastPrompt;
      reprompt = lastPrompt;
      break;
    case 'last':
      prompt = randomItem(content[closingType]) + randomItem(content.byeBye);
      reprompt= null;
      break;
  }

  if (reprompt) {
    session.useContinous = false;
    const repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(session);
    return handlerInput.responseBuilder
      .speak(prompt)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  } 

  // ending the session
  await cmn.endSession().catch(err => err);
  return handlerInput.responseBuilder
    .speak(prompt)
    .getResponse();
};