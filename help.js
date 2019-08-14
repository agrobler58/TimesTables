const cmn = require('./common');
const AnswerHandler = require('./answer');

const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";
const HELP_MESSAGE_LONG = " help you improve your multiplication and division skills, with three fun activities. " + 
  "<p>Just ask me to either: recite, test, or start a streak. </p>" +
  "<p>You can get more information on each of them by saying for example, explain reciting, or, what is a streak. </p>";

const handle = async function(handlerInput) {
  let prompt = "I can" + HELP_MESSAGE_LONG + "Which one would you like to do?";
  let reprompt = cmn.whatNow('then');
  let hint = "", d, card;
  const sessionAttributes = await cmn.getSession(handlerInput);
  switch (sessionAttributes.action) {
    case 'test': case 'streak':
      // check if we should provide a hint
      let o, hintIntro, noHintIntro;
      if (sessionAttributes.hint.given) {
        // to prevent endless repeating of the same hint
        return AnswerHandler.handle(handlerInput);
      } else {
        o = cmn.getOperands();
        if (sessionAttributes.action == 'streak' && sessionAttributes.streak.hints < 0) 
          noHintIntro = "Sorry, you've already used all three hints in this streak.";
        else {
          hint = cmn.giveHint(o.operand, o.factor, o.operand*o.factor, sessionAttributes.division);
          hintIntro = hint ? cmn.hintIntro(sessionAttributes.difficulty, o.operand, o.factor) : "";
          noHintIntro = "Sorry, I don't have any hints for this.";
        }
        const noHint = noHintIntro + " <break time='300ms'/>Try your best guess, on " 
          + (sessionAttributes.division
            ? `${o.factor*o.operand} divided by ${o.factor}`
            : `${o.operand} times ${o.factor}`);
        
        sessionAttributes.hint.given = true;
        if (sessionAttributes.streak && sessionAttributes.streak.hints >= 0 && hint != "")
          sessionAttributes.streak.hints--;
        prompt = hint != "" ? hintIntro + hint : noHint;
        reprompt = "What did you get?";
      }
      break;

    case 'streak_resume|test': case 'streak_resume|recite': case 'streak_resume|level':
      prompt = "You paused a streak last time, which you can now resume. <p>Would you like to do that?</p>";
      reprompt = "Do you want to resume your paused streak?";
      break;  

    case 'streak_quit|stop': case 'streak_quit|cancel': 
    case 'streak_quit|test': case 'streak_quit|recite': case 'streak_quit|level': 
      prompt = "Your streak will break, ";
      prompt += sessionAttributes.streak.isOverPB 
        ? "however, your new personal best will still be recorded." 
        : "and you will miss a chance to improve your personal best."
      prompt += "<p>Are you sure this is what you want to do</p>";
      reprompt = "Do you really want to break this streak?";
      break;  
  
    case 'test_starting': case 'recite_starting':
      d = sessionAttributes.difficulty;
      prompt = `Your current difficulty level is ${['easy', 'moderate', 'hard'][(d-8)/4]}, 
        with times tables of up to ${d} by ${d}, so you can choose any number between 2 and ${d}.`;
      reprompt = 'Which number do you choose?';
      break;

    case 'level_change':
      d = sessionAttributes.difficulty;
      let remaining = ['easy', 'moderate', 'hard'];
      let current = remaining.splice((d-8)/4,1);
      prompt = `Your current difficulty level is ${current[0]}, with times tables of up to ${d} by ${d}. 
        You can change to either ${remaining[0]}, or ${remaining[1]}.`;
      reprompt = 'What level do you choose?';
      break;

    default:
      card = {
        type: 'standard',
        title: 'Quick Help',
        content: "I can" + HELP_MESSAGE_LONG.replace(/<p>/g, '\n').replace(/<[^>]*>/g, ''),
        imageUrl: SMILEY_IMG
      };
      break;
  }

  sessionAttributes.repeat = sessionAttributes.repeat || {};
  sessionAttributes.repeat.prompt = prompt;
  sessionAttributes.repeat.reprompt = reprompt;

  sessionAttributes.disambiguate = null;
  sessionAttributes.useContinous = false;
  const repromptIntro = cmn.randomPhrase('repromptIntro');
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  let builder = handlerInput.responseBuilder
    .speak(prompt)
    .reprompt(repromptIntro + reprompt);
  if (card)
    builder = builder.withStandardCard(card.title, card.content, card.imageUrl+'_small.png', card.imageUrl+'_large.png');
  return builder.getResponse();
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  }, handle,
  HELP_MESSAGE_LONG
};

module.exports = HelpHandler;