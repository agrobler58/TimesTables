const content = require('content');
const quiz = require('./quiz');
const streak = require('./streak');
const recite = require('./recite');
const disambiguate = require('./disambiguate');

const cmn = require("./common");
const randomItem = cmn.randomItem;
const randomPhrase = cmn.randomPhrase;
const giveHint = cmn.giveHint;

const randomTruth = function(skew) {
  // with skew > 0.5 true will be returned more often, false otherwise
  const r = Math.random();
  return r < skew;
};

const formatStory = function(factor, operand, session) {
  // setup a story filter - pickup only stories relevant to factor and operand range
  const op = session.division ? operand / factor : operand;
  const storyFilter = (s, i) => s.factors.indexOf(factor) !== -1 
                              && s.min <= op 
                              && (!s.max || s.max >= op) 
                              && !session.stories.used.includes(i); // and skip ones that were already used
  const stories = content.stories;
  // enumerate them if not already
  if (!stories[1].i) {
    let i = 0;
    stories.forEach(s => s.i = i++);
  }
  // filter stories
  const filtered = stories.filter(storyFilter);
  if (!filtered.length)
    return "";

  // select a story randomly
  let selected = filtered[Math.floor(Math.random()*filtered.length)];
  session.stories.used.push(selected.i);
  // clip the used collection, if it's getting too big
  if (session.stories.used.length > stories.length*2/3) {
    const blockLength =  Math.floor(stories.length/3);
    session.stories.used.splice(0, blockLength);
  }
  // note the post comment if story has any and if the question's result satisfies minimum condition
  const product = session.division ? operand : factor*operand;
  session.stories.postComment = selected.post && (!selected.postMin || product >= selected.postMin) ? selected.post : "";

  // prepare for easter egg #2 (not much)
  const useHowMuch = selected.much && (selected.much == "both" || (session.division ? selected.much == "division" : selected.much == "multiplication"));
  session.useHowMany = !useHowMuch;

  let story = selected[session.division ? "d" : "m"];
  // replace dynamic content
  let i = -1;
  while ((i = story.indexOf('{#')) !== -1) {
    let j = story.indexOf('}', i+1);
    let contentPart = story.substring(i+2, j);
    let regex = new RegExp('{#' + contentPart + '}', 'g');
    story = story.replace(regex, randomItem(content[contentPart]));
  }
  // replace factor and operand
  story = story.replace('{0}', factor);
  story = story.replace('{1}', operand);
  return story;
};

const getQuestion = function(factor, operand, product, correct, canUseContinous, session, noHint, personalBest) {
  
  canUseContinous = canUseContinous && correct;

  // have we just told a story?
  let postStoryComment = "", isPostStory = false;
  if (session.stories.countDown == -1) {
    canUseContinous = false;
    isPostStory = true;
    // reset the count-down to next story
    session.stories.countDown = Math.floor(Math.random()*3+2) + (session.difficulty-8)/4;
    if (correct && !personalBest) {
      postStoryComment = session.stories.postComment;
      if (postStoryComment != "")
        postStoryComment +=  "<break time='600ms'/>";
    }
  }

  // should we do a story or a question
  let useStory = session.stories.countDown == 0;
  let question, story = "", storyLink = "";
  session.useHowMany = false; 
  if (useStory) {
    storyLink = randomPhrase('storyLinking');
    story = session.division 
      ? formatStory(factor, product, session) 
      : formatStory(factor, operand, session);
    if (story == "") {
      session.stories.countDown++; // keep count-down at zero if story couldn't be found
      useStory = false;
    }
  }
  if (!useStory) {  // no story this time, do a question
    // only use continous question phrases where appropriate
    let questionFilter = q => !q.continous;
    if (isPostStory)
      questionFilter = q => q.opening;
    else if (canUseContinous)
      questionFilter = () => true; 

    // use interjection after post story comment or incorrect answer
    const useInterjection = postStoryComment != "" || !correct;
    question = cmn.formatQuestion(session.division, questionFilter, factor, operand, canUseContinous, useInterjection);
    if (!useStory && question.indexOf('many') != -1)
      session.useHowMany = true; //TODO: fix, don't use session.repeat
  }
  session.stories.countDown--;

  // can we provide a hint
  const hint = noHint ? "" : giveHint(operand, factor, product, session.division);
  
  cmn.setRepeatQuestion(hint != "",
    useStory ? story : cmn.formatQuestion(session.division, q => q.opening, factor, operand),
    hint ? hint : cmn.formatQuestion(session.division, q => q.opening, factor, operand)
  );

  return {
    question: useStory ? storyLink + story : postStoryComment + question,
    reprompt: hint ? hint : cmn.formatQuestion(session.division, q => q.opening, factor, operand),
    hint: hint,
    card: useStory ? story : null
  };
};

const checkAnswerNextQuestion = async function(answer, session) {

  const o = cmn.getOperands();
  let operand = o.operand;
  let factor = o.factor;
  let product = factor * operand;
    
  // is the answer correct?
  const result = session.division ? operand : product;
  const correct = answer*1 == result;
  if (correct) {
    session.correctAnswers++;
    session.secondChance = false;
    session.disambiguate = null;
    session.useContinous = true;
  } else if (answer != null) {
    // re-prompt if answer is unusual
    session.secondChance = (answer*1 < result * 0.5 || answer*1 > result * 2) 
                            && !session.secondChance; // one chance only
    if (session.secondChance) {
      session.disambiguate = 'first';
      session.hint.given = false;
      return {
        speak: randomPhrase('sayAgain'), 
        reprompt: session.repeat.reprompt
      };
    }
  }
  // randomly determine whether to use division with the next question
  session.division = randomTruth(0.3);

  if (session.action == 'test') 
    return quiz.nextQuestion(getQuestion, session, factor, operand, correct, result, answer);
  else // action = streak
    return streak.nextQuestion(getQuestion, session, factor, operand, correct, result);
};

const whatWithAnswer = function(factor) {
  return " What" + randomItem(content.likeWantShall) + `do with the ${factor} times table, recite? or test.`;
};

const handle = async function(handlerInput) {
  const request = handlerInput.requestEnvelope.request;
  const slots = request.intent.slots;
  const answerSlot = slots ? slots.result : null;
  const sessionAttributes = await cmn.getSession(handlerInput);
  switch (sessionAttributes.action) {
    case 'test_starting': case 'test_launch': case 'test_continue':
      return quiz.handle(handlerInput);
    case 'recite_starting': case 'recite_launch': case 'recite':
      return recite.handle(handlerInput);
    case 'test': case 'streak':
      break;
    default:
      if (slots && answerSlot && answerSlot.value != '?' && !slots.unit.value && !slots.lessThan.value) {
        const factor = Math.abs(answerSlot.value*1);
        const prompt = whatWithAnswer(factor);
        const reprompt = whatWithAnswer(factor);
        sessionAttributes.factor = factor;
        sessionAttributes.repeat = {
          prompt: prompt,
          reprompt: reprompt
        };
        const repromptIntro = randomPhrase('repromptIntro');
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
          .speak(randomItem(['Well,', 'Ok,', 'Hmm,']) + prompt)
          .reprompt(repromptIntro + reprompt)
          .getResponse();
      } else
        return disambiguate.getResponse(handlerInput);
  }

  let answer = answerSlot ? answerSlot.value : null;

  // -- easter egg #2  
  if (!answer && slots && slots.notMuch && slots.notMuch.value) {
    sessionAttributes.easterEggAllowance--;
    const repromptIntro = randomPhrase('repromptIntro');
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    if (sessionAttributes.easterEggAllowance)
      return handlerInput.responseBuilder
        .speak(randomItem(['Well, ', 'Ok, ', 'Hmm, '])  
          + randomItem(['maybe', 'possibly', 'perhaps', 'could be'])
          + `. But how ${sessionAttributes.useHowMany ? 'many' : 'much'} exactly?`)
        .reprompt(repromptIntro + sessionAttributes.repeat.reprompt)
        .getResponse();
    else
      answer = null;
  }
  
  // -- easter egg #3
  if (answer && slots) {
    const lessThanValue = cmn.resolveSlotValue(slots.lessThan);
    if (lessThanValue) {
      const o = cmn.getOperands();
      const result = sessionAttributes.division ? o.operand : o.operand*o.factor;
      sessionAttributes.easterEggAllowance--;
      const repromptIntro = randomPhrase('repromptIntro');
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      if (sessionAttributes.easterEggAllowance && (
        lessThanValue == "less than" && result < answer*1
        || lessThanValue == "more than" && result > answer*1))
        return handlerInput.responseBuilder
          .speak(randomItem(['Well, ', 'Ok, ', 'Hmm, '])  
            + randomItem(['that is true', "you're right", 'it actually is', 'yes'])
            + ". But what is it exactly?")
          .reprompt(repromptIntro + sessionAttributes.repeat.reprompt)
          .getResponse();
      else if (!sessionAttributes.easterEggAllowance)
        answer = null;
      else if (result == answer*1)
        answer = answer*1 - 1;
    }
  }
  
  const reply = await checkAnswerNextQuestion(answer, sessionAttributes);
  sessionAttributes.easterEggAllowance = Math.floor(Math.random()*3)+3;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  if (sessionAttributes.failedStreak)
    return streak.handle(handlerInput);
  let builder = handlerInput.responseBuilder
    .speak(reply.speak)
    .reprompt(reply.reprompt);
  if (reply.card) 
    builder = reply.card.type == 'simple'
      ? builder.withSimpleCard(reply.card.title, reply.card.content)
      : builder.withStandardCard(reply.card.title, reply.card.content, reply.card.imageUrl+'_small.png', reply.card.imageUrl+'_large.png');
  return builder.getResponse();
};

const AnswerHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
        && request.intent.name === 'AnswerIntent');
  }, handle
};

module.exports = AnswerHandler;