const moment = require('moment');
const difficultyMap = require('./difficulty');

const cmn = require('./common');
const randomItem = cmn.randomItem;
const randomPhrase = cmn.randomPhrase;

const CORRECT_DING = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_neutral_response_01'/>";
const BROKEN_STREAK = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_negative_response_02'/>";
const CONGRATS_JINGLE = "<audio src='soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_02'/>";
const TROPHY_IMG = "https://s3.amazonaws.com/tt-streak/trophy";
const SMILEY_IMG = "https://s3.amazonaws.com/tt-streak/smiley";

const buildStreak = function(scope, firstRound=true) {
  const map = difficultyMap[['easy', 'moderate', 'hard'][(scope - 8) / 4]];
  const arr = []; 
  for(let difficulty=1; difficulty<=3; difficulty++) {
    let factor = 1;
    map.forEach(vector => {
      let operand = 1;
      vector.forEach(weight => {
        if (weight == difficulty) {
            arr.push((factor * 16 + operand).toString(16));
        }
        operand++;
      });
      factor++;
    });
  }
  if (firstRound) {
    const split = (scope-1) * Math.floor((scope-1)/2) + Math.floor(Math.random()*scope*2 - scope);
    const easierPart = shuffle(arr.slice(0, split)).join('');
    const harderPart = shuffle(arr.slice(split)).join('');
    return easierPart + harderPart;
  } else  // don't do the weighted split on subsequent rounds (if any)
    return shuffle(arr).join('');
};

const shuffle = function(arr) {
  const newArr = [];
  while (arr.length) {
    const randomIndex = Math.floor(Math.random() * arr.length),
        element = arr.splice(randomIndex, 1);
    newArr.push(element[0]);       
  }
  return newArr;
};

const updateStreak = function(session) {
  const userData = session.userData[0];
  const level = (session.difficulty - 8) / 4;
  const currentMonth = moment.utc().month();
  const streak = session.streak;
  const monthlyBest = userData.monthlyBest[level];
  if (monthlyBest.month != currentMonth) {
    monthlyBest.month = currentMonth;
    monthlyBest.score = 0;
    monthlyBest.streak = 0;
    monthlyBest.runs = 0;
  }
  if (!streak.runCountUpdated)
    monthlyBest.runs++;
  monthlyBest.score = Math.max(monthlyBest.score, streak.score);
  monthlyBest.streak = Math.max(monthlyBest.streak, session.correctAnswers);
  const allTimeBest = userData.allTimeBest[level];
  if (!streak.runCountUpdated)
    allTimeBest.runs++;
  allTimeBest.score = Math.max(allTimeBest.score, streak.score);
  allTimeBest.streak = Math.max(allTimeBest.streak, session.correctAnswers);
  streak.runCountUpdated = true;
};

const isPersonalBest = function(session) {
  const level = (session.difficulty - 8) / 4;
  // if already announced, don't do it again
  if (session.streak.personalBestAnnounced[level]) return false;
  const userData = session.userData[0];
  const allTimeBest = userData.allTimeBest[level];
  return allTimeBest.runs >= 2
    && allTimeBest.streak > 7
    && session.correctAnswers > allTimeBest.streak
    && session.streak.score > allTimeBest.score;
};

const nextQuestion = async function(getQuestion, session, factor, operand, correct, result) {
  let speak, card;
  let reprompt = cmn.whatNow('next');

  const streak = session.streak;
  const level = (session.difficulty - 8) / 4;
  const levelName = ['easy', 'moderate', 'hard'][level];
  const score = difficultyMap[levelName][factor-2][operand-2];

  // set up answer phrase filter - based on score (difficulty)
  const answerFilter = a => a.l <= score;
  
  if (correct) {
    streak.score += score;
    streak.remaining = streak.remaining.substring(2);
    if (streak.remaining == '') // full streak completed?! - let's start again
      streak.remaining = buildStreak(session.difficulty, false);
    const personalBest = isPersonalBest(session);

    // set new question
    const itemHex = session.streak.remaining.substring(0, 2);
    operand = parseInt(itemHex[1], 16) + 1;
    factor = parseInt(itemHex[0], 16) + 1;
    const qNext = getQuestion(factor, operand, factor*operand, true, session.useContinous && !personalBest && !session.hint.given, session, true, personalBest);
    reprompt = qNext.reprompt;
    if (qNext.card) 
      card = {
        type: 'standard',
        title: "x " + factor,
        content: qNext.card,
        imageUrl: SMILEY_IMG
      };

    if (personalBest) {
      session.streak.personalBestAnnounced[level] = true;
      speak = CONGRATS_JINGLE + `Wow! You've just broken your personal best at the ${levelName} level. `
        + "Keep going. <break time='400ms'/>" + qNext.question;
      session.repeat.prompt = `You've just broken your personal best at the ${levelName} level. <break time='400ms'/>` + qNext.question;
    } else {
      const encouragementSet = session.hint.given ? 'postHintEncouragement' : 'standardEncouragement';
      const encouragement = randomPhrase(encouragementSet, answerFilter);
      const pause = encouragement != ""
        ? (session.hint.given 
          ? "<break time='500ms'/>" 
          : "<break time='300ms'/>")
        : "";
      const hintsRemaining = !session.hint.given || session.streak.hints < 0 ? "" : [
        "<break time='300ms'/>And that was your last hint for this streak.", 
        "<break time='300ms'/>You still have one more hint left.",
        "<break time='300ms'/>You can use two more hints.",
        ""
        ][session.streak.hints];
      speak = CORRECT_DING + encouragement + hintsRemaining + pause + qNext.question;
    }
    updateStreak(session);

  } else { // incorrect
    if (session.correctAnswers == 0) {
      session.failedStreak = true;
      session.division = false;
      session.repeat = {
        outcome: BROKEN_STREAK + randomPhrase('wrongAnswer', answerFilter) + ` it's ${result}.` + 
          "<break time='500ms'/> Oh dear! We can't call this a streak; can we; <break time='300ms'/> Let's start again. "
      };
    } else {
      updateStreak(session);
      reprompt = cmn.whatNow('now', true);
      const streakComplete = `You've correctly answered ${session.correctAnswers} questions and scored ${streak.score} points in this streak. `;
      if (session.streak.personalBestAnnounced[level]) {
        speak = CONGRATS_JINGLE + "Actually,"
                  + ` it's ${result}. <p>` 
                  + randomItem(["Never the less, it's time to celebrate!", "Still, congratulations!", "But look at you go,"])
                  + ` With ${session.correctAnswers} correct answers and ${streak.score} points, this was your best streak at his level.</p>`
                  + reprompt;
        card = {
          type: 'standard',
          title: "New Personal Best!",
          content: `You've completed a streak with\n${session.correctAnswers} correct answers and scored ${streak.score} points\nat the ${levelName} level. `,
          imageUrl: TROPHY_IMG
        };
      } else {
        speak = BROKEN_STREAK 
                  + randomPhrase('wrongAnswer', answerFilter)
                  + ` it's ${result}. ${streakComplete}` + reprompt;
        card = {
          type: 'standard',
          title: "Streak Ended",
          content: `with ${session.correctAnswers} correct answers and ${streak.score} points\nat the ${levelName} level. `,
          imageUrl: SMILEY_IMG
        };
      }
      session.repeat = {
        prompt: streakComplete + reprompt,
        reprompt: reprompt
      };
    }
    session.action = null;
    session.streakEnded = true;
  }

  session.hint.given = false;
  return { speak: speak, card: card, reprompt: randomPhrase('repromptIntro') + reprompt };
};

const handle = async function(handlerInput) {
  const sessionAttributes = await cmn.getSession(handlerInput, true);
  sessionAttributes.action = 'streak';
  sessionAttributes.factor = null;

  let resumingStreak;
  if (sessionAttributes.streak && sessionAttributes.streak.resuming) {
    resumingStreak = true;
    delete sessionAttributes.streak.resuming;
  } else if (sessionAttributes.userData[0].streak) {
    // read paused streak info from user data
    const pausedStreak = sessionAttributes.userData[0].streak;
    sessionAttributes.correctAnswers = pausedStreak.correct;
    sessionAttributes.division = pausedStreak.division;
    sessionAttributes.streak = {
      remaining: pausedStreak.remaining,
      score: pausedStreak.score,
      hints: pausedStreak.hints,
      personalBestAnnounced: pausedStreak.personalBestAnnounced.map(v => v)
    };
    resumingStreak = true;
    delete sessionAttributes.userData[0].streak;
  } else {
    // otherwise initialize new streak
    sessionAttributes.correctAnswers = 0;
    sessionAttributes.division = false;
    sessionAttributes.streak = {
      remaining: buildStreak(sessionAttributes.difficulty),
      score: 0,
      hints: 3,
      personalBestAnnounced: [false, false, false]
    };
    sessionAttributes.hint = { given: false };
  }

  sessionAttributes.disambiguate = null;
  sessionAttributes.useContinous = false;

  if (!sessionAttributes.stories)
    sessionAttributes.stories = { used: [] };
  sessionAttributes.stories.postComment = null;  
  sessionAttributes.stories.countDown = Math.floor(Math.random()*3+2) + (sessionAttributes.difficulty-8)/4;
  
  const itemHex = sessionAttributes.streak.remaining.substring(0, 2);
  const operand = parseInt(itemHex[1], 16) + 1;
  const factor = parseInt(itemHex[0], 16) + 1;

  let streakIntro = sessionAttributes.failedStreak 
    ? sessionAttributes.repeat.outcome 
    : resumingStreak 
      ? (sessionAttributes.welcome ? sessionAttributes.welcome : cmn.randomItem(["Awesome", "Of course", "Sure"])) + ". Resuming your streak."
      : "Ok, starting a streak."; 
  streakIntro += "<break time='400ms'/> ";
  delete sessionAttributes.welcome;
  delete sessionAttributes.failedStreak;

  const prompt = cmn.formatQuestion(sessionAttributes.division, q => q.opening, factor, operand);
  const reprompt = cmn.formatQuestion(sessionAttributes.division, q => q.opening, factor, operand);
  cmn.setRepeatQuestion(false, prompt, reprompt);
  
  const repromptIntro = cmn.randomPhrase('repromptIntro');
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  return handlerInput.responseBuilder
    .speak(streakIntro + prompt)
    .reprompt(repromptIntro + reprompt)
    .getResponse();
};

const StreakHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return (request.type === 'IntentRequest'
      && request.intent.name === 'StreakIntent');
    }, handle,
    nextQuestion
  };
    
module.exports = StreakHandler;