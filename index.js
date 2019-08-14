/* eslint-disable  func-names */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk-core');
const disambiguate = require('./disambiguate');

const cmn = require('./common');
const whatNow = cmn.whatNow;
const randomItem = cmn.randomItem;
const randomPhrase = cmn.randomPhrase;
const sayBye = cmn.sayBye;
const getSession = cmn.getSession;
const endSession = cmn.endSession;
const isGoodStreak = cmn.isGoodStreak;
const alertAboutGoodStreak = cmn.alertAboutGoodStreak;

const FALLBACK_HELP = "<p>To learn how to use the skill, just say help, at any time.</p>";
const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";

// ------------------ main handlers ------------------------------
const ReciteHandler = require('./recite');
const QuizHandler = require('./quiz');
const StreakHandler = require('./streak');
const AnswerHandler = require('./answer');
const ExplainHandler = require('./explain');
const SetLevelHandler = require('./setLevel');
const HelpHandler = require('./help');

const SayAgainHandler = {
  canHandle(handlerInput) {
      const request = handlerInput.requestEnvelope.request;
      return (request.type === 'IntentRequest'
          && (request.intent.name === 'SayAgainIntent'));
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput);
    let speak, repromptIntro, repeat = sessionAttributes.repeat;
    if (!repeat) {
      sessionAttributes.repeat = {
        prompt: FALLBACK_HELP + whatNow(),
        reprompt: whatNow('then')
      };
      repeat = sessionAttributes.repeat;
      speak = "Sorry, have I said something? Not that I recall. " + repeat.prompt;
    } else
      speak = repeat.prompt;
    
    repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt(repromptIntro + repeat.reprompt)
      .getResponse();
  }
};

const RepeatHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
        && (request.intent.name === 'AMAZON.RepeatIntent' || request.intent.name === 'RepeatIntent'));
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput);
    switch (sessionAttributes.action) {
      case 'test_starting':
        if (sessionAttributes.lastFactor) {
          sessionAttributes.action = 'test';
          sessionAttributes.factor = sessionAttributes.lastFactor;
          delete sessionAttributes.lastFactor;
          handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
          return QuizHandler.handle(handlerInput);
        }
        break;
      case null:
        if (sessionAttributes.streakEnded) {
          delete sessionAttributes.streakEnded;
          handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
          return StreakHandler.handle(handlerInput);
        }
        break;
      case 'recite':
        return ReciteHandler.handle(handlerInput);
      case 'test_continue': case 'streak_continue':
        sessionAttributes.action = sessionAttributes.action.split('_')[0];
        break;
    }
    let speak, reprompt;
    let repromptIntro = randomPhrase('repromptIntro');
    let repeat = sessionAttributes.repeat;
    if (!repeat) {
      sessionAttributes.repeat = {
        prompt: FALLBACK_HELP + whatNow(),
        reprompt: whatNow('then')
      };
      repeat = sessionAttributes.repeat;
      speak = "Sorry, I really don't know what to repeat. " + repeat.prompt;
      reprompt = whatNow('then');
    } else if (repeat.question) {
      speak = repeat.question.prompt;
      reprompt = repeat.question.reprompt;
      if (repeat.question.hint)
        repromptIntro = cmn.hintIntro();
    } else {
      speak = repeat.prompt;
      reprompt = repeat.reprompt; 
    }

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  }
};


// ------------------ other handlers ------------------------------

const SessionStartHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput, true);
    if (sessionAttributes.userData[0].streak) {
      sessionAttributes.welcome = "Welcome back";
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return StreakHandler.handle(handlerInput);
    }

    const reprompt = whatNow();
    let card, welcomeMessage = "Welcome back. " + reprompt;
    if (sessionAttributes.newUser) {
      welcomeMessage = "Welcome to Times Tables. I'll" + HelpHandler.HELP_MESSAGE_LONG + "Which one would you like to do?";
      card = {
        type: 'standard',
        title: "Welcome!",
        content: "This skill will" + HelpHandler.HELP_MESSAGE_LONG.replace('<p>', '\n').replace(/<[^>]*>/g, ''),
        imageUrl: SMILEY_IMG
      };
    }
      
    sessionAttributes.repeat = {
      prompt: welcomeMessage,
      reprompt: reprompt
    };
    const repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    let builder = handlerInput.responseBuilder
      .speak(welcomeMessage)
      .reprompt(repromptIntro + reprompt);
    if (card)
      builder = builder.withStandardCard(card.title, card.content, card.imageUrl+'_small.png', card.imageUrl+'_large.png');
    return builder.getResponse();
  },
};

const YesHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.YesIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput);
    switch (sessionAttributes.action) {
      case 'recite_launch':
        return ReciteHandler.handle(handlerInput);
      case 'test_launch':
        return QuizHandler.handle(handlerInput);
      case 'streak_resume|test': case 'streak_resume|recite': case 'streak_resume|level':
        delete sessionAttributes.slots;
        delete sessionAttributes.promptIntro;
      case 'streak_launch':
        return StreakHandler.handle(handlerInput);
      case 'streak_quit|stop': case 'streak_quit|cancel': case 'streak_quit|test': case 'streak_quit|recite': case 'streak_quit|level': 
        delete sessionAttributes.quitStreak;
        delete sessionAttributes.streak.resuming;
        switch (sessionAttributes.action.split('|')[1]) {
          case 'cancel':
            return CancelHandler.handle(handlerInput);
          case 'stop':
            return ExitHandler.handle(handlerInput);
          case 'test':
            return QuizHandler.handle(handlerInput);
          case 'recite':
            return ReciteHandler.handle(handlerInput);
          case 'level':
            return SetLevelHandler.handle(handlerInput);
        }

      case 'test_continue': case 'streak_continue':
        sessionAttributes.action = sessionAttributes.action.split('_')[0];
        const prompt = sessionAttributes.repeat.question.prompt;
        const reprompt = sessionAttributes.repeat.question.reprompt;
        const repromptIntro = sessionAttributes.repeat.question.hint ? cmn.hintIntro() : randomPhrase('repromptIntro');
        sessionAttributes.disambiguation = null;
        sessionAttributes.useContinous = false;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
          .speak(randomItem(["Ok. ", "Great. ", "Awesome. "]) + prompt)
          .reprompt(repromptIntro + reprompt)
          .getResponse();
    }

    // unexpected yes
    return disambiguate.getResponse(handlerInput);
  }
};

const NoHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.NoIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput);
    switch (sessionAttributes.action) {
      case 'recite_launch': case 'recite_starting':
      case 'test_launch': case 'test_starting': case 'test_continue':
      case 'streak_launch': case 'streak_continue':
        return CancelHandler.handle(handlerInput);

      case 'streak_quit|stop': case 'streak_quit|cancel': case 'streak_quit|test': case 'streak_quit|recite': case 'streak_quit|level':
        delete sessionAttributes.quitStreak;
        delete sessionAttributes.promptIntro;
        sessionAttributes.streak.resuming = true;
        return StreakHandler.handle(handlerInput);

      case 'streak_resume|test': case 'streak_resume|recite': case 'streak_resume|level':
        // cancel paused streak and go to respective intent
        delete sessionAttributes.userData[0].streak;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        switch (sessionAttributes.action.split('|')[1]) {
          case 'test': 
            return QuizHandler.handle(handlerInput);
          case 'recite': 
            return ReciteHandler.handle(handlerInput);
          case 'level':
            return SetLevelHandler.handle(handlerInput);
        }

      // unexpected no
      case 'test': case 'streak':
        return disambiguate.getResponse(handlerInput);
      default:
        break;
    }
    await endSession().catch(err => err);
    return handlerInput.responseBuilder
      .speak(sayBye())
      .getResponse();
  }
};

const FallbackHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return disambiguate.getResponse(handlerInput);
  }
};

const PauseStreakHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.PauseIntent');
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput);
    let promptIntro = "You can only pause a streak. ", prompt, reprompt;
    switch (sessionAttributes.action) {

      case 'streak_launch':
        promptIntro = "You can only pause a running streak. You haven't started one yet. ";
        prompt = "Would you like to try out a streak?";
        reprompt = "Would you like to start a streak challenge?";
        break;
      case 'test': case 'test_continue':
        prompt = `Would you like to go on with your ${sessionAttributes.factor} times table test?`;
        reprompt = `Do you still want to continue with your ${sessionAttributes.factor} times table test?`;
        sessionAttributes.action = 'test_continue';
        break;
      case 'test_launch':
        prompt = "Would you like to try a test?";
        reprompt = "Do you still want to do a test?";
        break;
      default:
        reprompt = sessionAttributes.repeat ? sessionAttributes.repeat.reprompt : cmn.whatNow('then');
        prompt = sessionAttributes.repeat ? sessionAttributes.repeat.reprompt : cmn.whatNow();
        break;

      case 'streak': case 'streak_continue': 
      case 'streak_quit|stop': case 'streak_quit|cancel': case 'streak_quit|test': case 'streak_quit|recite': case 'streak_quit|level': 
        prompt = randomItem(['Sure. ', 'OK. ', 'No problem. ']) 
          + "<p>Your streak will automatically resume next time you launch the skill.</p>" 
          + randomItem(["Bye for now.", "Bye-<prosody pitch='-10%'>bye</prosody>.", "Talk to you later."]);
        // update userData with streak
        sessionAttributes.streak.correct = sessionAttributes.correctAnswers;
        sessionAttributes.streak.division = sessionAttributes.division;
        sessionAttributes.userData[0].streak = sessionAttributes.streak;
        await endSession().catch(err => err);
        return handlerInput.responseBuilder
          .speak(prompt)
          .getResponse();
    }

    sessionAttributes.disambiguate = null;
    sessionAttributes.repeat = sessionAttributes.repeat || {};
    sessionAttributes.repeat.prompt = prompt;
    sessionAttributes.repeat.reprompt = reprompt;

    const repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(promptIntro + prompt)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  },
};

const ResumeStreakHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.ResumeIntent';
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput, true);
    if (sessionAttributes.userData[0].streak) {
      sessionAttributes.welcome = "Welcome back";
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return StreakHandler.handle(handlerInput);
    }

    let prompt, reprompt;
    switch (sessionAttributes.action) {
      case 'streak': case 'streak_continue':
        sessionAttributes.streak.resuming = true;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return StreakHandler.handle(handlerInput);
      case 'test': case 'test_continue':
        prompt = `Would you like to go on with your ${sessionAttributes.factor} times table test?`;
        reprompt = `Do you still want to continue with your ${sessionAttributes.factor} times table test?`;
        sessionAttributes.action = 'test_continue';
        break;
      case 'test_launch': case 'streak_launch':
        const action = sessionAttributes.action.split('_')[0];
        prompt = `Would you like to try a ${action}?`;
        reprompt = `Do you still want to do a ${action}?`;
        break;
      default:
        reprompt = sessionAttributes.repeat ? sessionAttributes.repeat.reprompt : cmn.whatNow('then');
        prompt = sessionAttributes.repeat ? sessionAttributes.repeat.reprompt : cmn.whatNow();
        break;
    }
    const promptIntro = "<p>Sorry, there is no paused streak that we could resume.</p>";

    sessionAttributes.disambiguate = null;
    sessionAttributes.repeat = sessionAttributes.repeat || {};
    sessionAttributes.repeat.prompt = prompt;
    sessionAttributes.repeat.reprompt = reprompt;

    const repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(promptIntro + prompt)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  },
};
  
const CancelHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.CancelIntent');
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput, true);
    if (!sessionAttributes.quitStreak && isGoodStreak())
      return alertAboutGoodStreak('cancel', handlerInput);

    let reprompt = whatNow('instead');
    const action = sessionAttributes.action ? sessionAttributes.action.split('_')[0] : null;

    const openingPart = "What " + randomItem(["would you like to", "do you want to", "shall we"]) + " do instead: ";
    const streakPart = randomItem(["", "start", "run", "begin"]) + " a streak";
    switch (action) {
      case 'test':
        reprompt = openingPart + "recite? or " + streakPart;
        break;
      case 'streak':
        reprompt = openingPart + "recite? or test";
        break;
      case 'recite':
        reprompt = openingPart + "test? or " + streakPart;
        break;
      case 'level':
        reprompt = whatNow('now');
        break;
      default:
        delete sessionAttributes.userData[0].streak;
        await endSession().catch(err => err);
        return handlerInput.responseBuilder
          .speak(sayBye())
          .getResponse();
    }
    sessionAttributes.action = null;
    sessionAttributes.disambiguate = null;
    sessionAttributes.factor = null;
    sessionAttributes.repeat = {
      prompt: reprompt,
      reprompt: reprompt
    };

    let intro = randomItem(["No worries", "Sure", "Ok", "All right"]) + ". ";
    if (sessionAttributes.promptIntro) {
      intro = sessionAttributes.promptIntro;
      delete sessionAttributes.promptIntro;
    }
  
    const repromptIntro = randomPhrase('repromptIntro');
    delete sessionAttributes.promptIntro;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return handlerInput.responseBuilder
      .speak(intro + reprompt)
      .reprompt(repromptIntro + reprompt)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.StopIntent');
  },
  async handle(handlerInput) {
    const sessionAttributes = await getSession(handlerInput, true);
    if (!sessionAttributes.quitStreak && isGoodStreak())
      return alertAboutGoodStreak('stop', handlerInput);

    delete sessionAttributes.userData[0].streak;
    await endSession().catch(err => err);
    return handlerInput.responseBuilder
      .speak(sayBye())
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'SessionEndedRequest';
  },
  async handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
    await getSession(handlerInput);
    await endSession().catch(err => err);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  async handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    await getSession(handlerInput);
    await endSession().catch(err => err);
    return handlerInput.responseBuilder
      .speak('Sorry, an error occurred.')
      .getResponse();
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    FallbackHandler,
    QuizHandler,
    StreakHandler,
    ReciteHandler,
    RepeatHandler,
    SayAgainHandler,
    AnswerHandler,
    SetLevelHandler,
    SessionStartHandler,
    YesHandler,
    NoHandler,
    HelpHandler,
    ExplainHandler,
    ExitHandler,
    PauseStreakHandler,
    ResumeStreakHandler,
    CancelHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();