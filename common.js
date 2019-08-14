const moment = require('moment');
const dbUser = require('./dbUser');
const dbAnswers = require('./dbAnswers');
const content = require('./content.json');
const hints = require('./hints.json');
const difficultyMap = require('./difficulty.json');

let session;
exports.getSession = async function(handlerInput, initialise) {
  session = handlerInput.attributesManager.getSessionAttributes();
  if (!initialise || session.userData)
    return session;

  const request = handlerInput.requestEnvelope.session;
  const userId = request.user.userId.split('.')[3];
  const result = await dbUser.getUserData(userId).catch((err) => err);
  if (result.success) {
    session.userData = result.data;
    session.difficulty = result.data[0].level * 4 + 8;
  } else {
    console.log(result.message);
    session.difficulty = 12;
  }
  session.testedFactors = [];
  session.hint = {};
  session.easterEggAllowance = Math.floor(Math.random()*3)+3;
  session.content = {};

  const now = moment.utc();
  const elapsed = moment.duration(now.diff(moment(session.userData[0].dateJoined))).as("seconds");
  session.newUser = elapsed < 5;

  return session;
};

exports.endSession = async function() {
  if (session.userData) {
    session.userData[0].level = (session.difficulty - 8) / 4;
    let result = await dbUser.updateUserData(session.userData).catch(err => err);
    console.log(result);
    if (session.testedFactors.length) {
      let result = await dbAnswers.answersUpdate(session.userData, session.testedFactors).catch(err => err);
      console.log(result);
    }
  }
};

exports.whatNow = function(mode, another) {
  const prompt = "What" + randomItem(content.likeWantShall)
    + `do. recite? test? or ${randomItem(["", "start", "run", "begin"])} ${another ? 'another' : 'a'} streak`;
  return mode ? prompt.replace('.', ' ' + mode + '.') : prompt;
};

exports.sayBye = function() {
  return randomItem(["Ok, ", "Allright, ", "Fair enough, "]) + randomItem(content.byeBye);
};

exports.getOperands = function() {
  if (session.action == 'test') {
    return {
      factor: session.factor * 1,
      operand: session.testShuffle[session.shuffleIndex]
    };
  } else { // streak
    const itemHex = session.streak.remaining.substring(0, 2);
    return {
      operand: parseInt(itemHex[1], 16) + 1,
      factor: parseInt(itemHex[0], 16) + 1
    };
  }
};

exports.getDifficultyMap = function(level) {
  const difficulty = ['easy', 'moderate', 'hard'][(level - 8) / 4];
  return difficultyMap[difficulty];
};

exports.invalidFactor = function(factor, scope, reply) {
  if (!factor || factor > 16 || factor < 2) {
    reply.intro = "Sorry, ";
    reply.prompt = "I can only work with times tables between 2 and 16. Which one do you want?";
    return true;
  }
  if (factor > scope) {
    const suggestedLevel = scope == 8 ? 'moderate' : 'hard';
    reply.intro = "Hmm, ";
    reply.prompt = `${factor} is above your current difficulty level which includes times tables up to ${scope}. 
      To change the level, just say for example, set level to ${suggestedLevel}.`;
    return true;
  }
  return false;
};

const randomItem = function(items) {
  // selects a random item from items array
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
};
exports.randomItem = randomItem;

const setRandomSequence = function(contentSection) {
	const phrases = content[contentSection];
	if (!phrases) return;
	
	if (!session.content)
	  session.content = {};
	  
	const sequence = [];
	phrases.forEach((phrase, i) => {
		for (let j=0; j<phrase.d; j++)
			sequence.push(i);
	});
	const shuffled = [];
	while (sequence.length) {
		const randomIndex = Math.floor(Math.random() * sequence.length),
			  element = sequence.splice(randomIndex, 1);
		shuffled.push(element[0]);       
	}
	// minimise repetition by swapping neighbours where repetition is undesirable
	for (let j=1; j<shuffled.length-1; j++) 
		if (shuffled[j] == shuffled[j-1] && shuffled[j] != shuffled[j+1] && !phrases[shuffled[j]].repeat) {
			let swap = shuffled[j];
			shuffled[j] = shuffled[j+1];
			shuffled[j+1] = swap;	
		}
	let hexList = shuffled.reduce((hexStr, e) => hexStr + e.toString(16), '');
	//console.log(shuffled);                                              
	//console.log(hexList);                                              
	session.content[contentSection] = {
		shuffled: hexList,
		current: 0
	};
}; 

const randomPhrase = function(contentSection, filter) {

	// initialise random sequence on the first pass
	if (!session.content || !session.content[contentSection])
		setRandomSequence(contentSection);
	const sequence = session.content[contentSection];

	const phrases = content[contentSection];
	// add indices on the first pass
	if (!phrases[0].idx) {
		let i = 0;
		phrases.forEach(phrase => phrase.idx = i++);
	}

	// apply filter 
	let filtered = filter ? phrases.filter(filter) : phrases.filter(() => true);

	let i = 0, round = 0, phrase;
	do { // while moving through sequence, skip any filtered-out phrases
		i = parseInt(sequence.shuffled[sequence.current++], 16);
		if (sequence.current > sequence.shuffled.length) {
			sequence.current = 0;
			round++;
		}
		phrase = filtered.find(p => p.idx == i);
	} while (!phrase && round <= 1);

	if (round > 1) {
		// circuit breaker has opened, why?
		console.log(JSON.stringify(filtered, null, 1));
		return phrases[0].p;
	}
	
	return phrase.p; 
};
exports.randomPhrase = randomPhrase;

exports.formatQuestion = function(useDivision, questionFilter, factor, operand, useContinous, useInterjection) {
	const contentSection = useDivision ? "divisionQuestions" : "multiplicationQuestions";
	let question;
	if (useContinous && Math.random() < 0.66) 
		question = content[contentSection][1].p.replace('{#and}', '');
	else {  // select question randomly
		question = randomPhrase(contentSection, questionFilter);
		// then replace #and and #what with respective variations
		question = question.replace('{#what}', randomPhrase('what'));
		question = question.replace('{#and}', randomPhrase('and'));
		if (useInterjection) 
			question = randomPhrase('now') + question;
	}
	// finally replace factor and operand
	question = question.replace('{0}', factor);
	question = question.replace('{1}', useDivision? operand*factor : operand);
	return question;
};

exports.setRepeatQuestion = function(isHint, prompt, reprompt) {
  session.repeat = {
    question: {
      prompt: prompt,
      reprompt: reprompt,
      hint: isHint
    },
    prompt: prompt,
    reprompt: reprompt
  };
};

exports.giveHint = function(operand, factor, product, isDivision) {
  // give hints for most questions

  const as = () => randomItem(["since", "as"]);
  const it = () => randomItem(["that", "it"]);
  const is = () => randomItem(["is", "equals", "can be expressed as", "is the same as"]);
  const just = (s) => randomItem(["you can ", "you just ", "try to ", "just ", ""].slice(s ? s: 0));
  let p, q;

  let pattern = hints[isDivision ? 'division' : 'multiplication'][operand-2][factor-2];
  switch (pattern) {
    
    // multiplication patterns
    case '=f+f':
      return randomItem([just() + `add ${factor} to itself`, `${it()}'s ${factor} added to itself`]);
    case '=f*o':
      return randomItem(["It is ", "It's ", "That's "]) + randomItem(["actually ", "exactly ", ""])
        + `the same as ${factor} times ${operand}.`;
    case '?2*f,+f': case '?4*f,+f': case '?10*f,+f':
      return randomItem([
        `if you know what ${operand-1} times ${factor} is, then ${just(2)}add another ${factor}`,
        `multiply ${factor} by ${operand-1} first, then ${just(2)}add another ${factor}`
      ]);
    case '?10*f,-f':
      return randomItem([
        `if you know what ten times ${factor} is, then ${just(2)}subtract ${factor} from ${it()}`,
        `multiply ${factor} by ten first, then ${just(2)}subtract ${factor} from ${it()}`
      ]);
    case '?o*10,+o':
      return randomItem([
        `if you know what ${operand} times ten is, then ${just(2)}add another ${operand}`, 
        `multiply ${operand} by ten first, then ${just(2)}add another ${operand}`]);
    case '?o*10,-o':
      return randomItem([
        `if you know what ${operand} times ten is, ${just(2)}subtract ${operand} from ${it()}`, 
        `multiply ${operand} by ten first, then ${just(2)}subtract ${operand} from ${it()}`]);
    case 'o*(10+2)': case 'o*(10+3)': case 'o*(10+4)': case 'o*(10+5)': case 'o*(10+6)':
      return `${as()} ${factor} ${is()} ${factor-10} plus 10, ${just()}` 
        + randomItem([
          `add ${operand} times ${factor-10} to ${operand*10}`,
          `multiply ${factor-10} by ${operand}<break time='200ms'/> and add ${it()} to ${operand*10}`
        ]);
    case '(10+2)*f': case '(10+3)*f': case '(10+4)*f': case '(10+5)*f': case '(10+6)*f':
      return `${as()} ${operand} ${is()} ${operand-10} plus 10, ${just()}`
        + randomItem([
          `add ${operand-10} times ${factor} to ${factor*10}`,
          `multiply ${factor} by ${operand-10}<break time='200ms'/> and add ${it()} to ${factor*10}`
        ]);
    case '(5+2)*f':
      return `${as()} seven ${is()} five plus two, ${just()}`
        + randomItem(["get", "do", "work out"]) + ` five times ${factor} first, `
        + randomItem(["and ", ""]) + `then add two times ${factor} to ${it()}.`;
    case '?2*f|*2': case '?3*f|*2': case '?2*f|*3': case '?4*f|*2': case '?2*f|*4': case '?2*f|*6': 
    case '?6*f|*2': case '?2*f|*7': case '?7*f|*2': case '?3*f|*5': case '?5*f|*3': case '?8*f|*2': case '?2*f|*8':
      p = pattern[1];
      q = pattern[6];
      return `${as()} ${operand} ` 
        + randomItem([
          is() + randomItem([` ${p} times ${q}, `, ` ${p} multiplied by ${q}, `]),
          `is a product of ${p} and ${q}, `
        ])
        + just() + randomItem(["get", "do", "work out"]) + ` ${p} times ${factor} first, `
        + randomItem(["and ", ""]) + `then multiply ${it()} by ${q}.`;

    // division patterns
    case '?+':
      return randomItem(["Which", "What"]) + " number " + randomItem(["do you", "should you", "would you", "can you"])
        + " add to itself, to get " + product;
    case '=f*f':
      return product + " is a perfect square, " + randomItem(["which", "that"]) + " you get by multiplying "
        + randomItem(["a number by itself.", "two equal numbers."]);
    case '?R/2|2': case '?R/2|3': case '?R/3|2': case '?R/2|4': case '?R/4|2': case '?R/3|3': case '?R/3|4': 
    case '?R/4|3': case '?R/2|7': case '?R/7|2': case '?R/3|5': case '?R/5|3': case '?R/2|8': case '?R/8|2':
      p = pattern[3];
      q = pattern[5];
      return `${as()} ${factor} ` 
        + randomItem([
          is() + randomItem([` ${p} times ${q}, `, ` ${q} multiplied by ${p}, `]),
          `is a product of ${p} and ${q}, `
        ])
        + `${just()}divide ${product} by ${p} first, `
        + randomItem(["and ", ""]) + `then further divide ${it()} by ${q}.`;
    case '?R*2,/10':
      return `${as()} two times five ${is()} ten, `
        + `${just()}multiply ${product} by two first, and then divide ${it()} by ten.`;
    case '?R/2/f,*2': case '?R/3/f,*3': case '?R/4/f,*4':
      p = pattern[3];
      return randomItem([
          `If you know what is ${product} divided by ${p} `,
          `${just()}divide ${product} by ${p} first, ` 
        ])
        + `then divide ${it()} by ${factor}, `
        + `and finally, multiply ${it()} back by ${p}.`;
    case '?R*2/f,/2':
      return randomItem([
          `If you know what is two times ${product}, `,
          randomItem(["get", "do", "work out"]) + ` two times ${product} first, `
        ])
        + `then divide ${it()} by ${factor}, `
        + `and finally, divide ${it()} again by two.`;
    case '-fd':
      return just(3) + randomItem(["remove", "take away", "strip off"]) + " the first digit";
    case '(R-f*10)/f':
      return `subtract ${factor*10} from ${product}, `
        + `divide ${it()} by ${factor}, and ` + randomItem(["finally", "lastly", "then"]) 
        + `, add ${it()} back to ten.`;
    default:
      return "";
  }
};  

exports.hintIntro = function(difficulty, operand, factor) {
  // assume moderate difficulty when not given
  let answerDifficulty = 2; 
  if (difficulty) {
    const level = ['easy', 'moderate', 'hard'][(difficulty - 8) / 4];
    answerDifficulty = difficultyMap[level][factor-2][operand-2];
  }
  return randomPhrase('hintIntro', p => p.l >= answerDifficulty);
};

exports.resolveSlotValue = function(slot) {
  if (!(slot && slot.resolutions)) return null;
  const slotValues = slot.resolutions.resolutionsPerAuthority[0].values;
  return slotValues ? slotValues[0].value.name : "NO_MATCH";
};

exports.alertAboutPausedStreak = function(action, handlerInput) {
  const prompt = ", you have a paused <prosody pitch='+10%'>streak</prosody> waiting.<p>Would you rather continue with it?</p>";
  const reprompt = "Would you prefer to continue your paused streak?";
  session.repeat = {
    prompt: prompt,
    reprompt: reprompt
  };
  session.action = "streak_resume|" + action;
  session.promptIntro = randomItem(["Ok<prosody pitch='low'>then</prosody>. ", "As you wish. ", "Fair enough. ", "Allright<prosody pitch='low'>then</prosody>. "]);
  handlerInput.attributesManager.setSessionAttributes(session);
  return handlerInput.responseBuilder
    .speak(randomItem(["Wait", "Hang <prosody pitch='-10%'>on</prosody>", "Excuse <prosody pitch='-10%'>me</prosody>", "Oh - but"]) + prompt)
    .reprompt(randomPhrase('repromptIntro') + reprompt)
    .getResponse();
};

exports.isGoodStreak = function() {
  if (session.action != 'streak') 
    return false;
  let isGood = false;
  const level = (session.difficulty - 8) / 4;
  if (session.correctAnswers >= 7 + level * 2) {
    session.streak.isGood = true;
    isGood = true;
  }
  const allTimeBest = session.userData[0].allTimeBest[level];
  if (isGood && allTimeBest.runs > 1) {
    const personalBest = allTimeBest.streak;
    if (session.correctAnswers + 3 >= personalBest) {
      session.streak.isNearPB = true;
      isGood = true;
    }
    if (session.correctAnswers >= personalBest && session.streak.score >= allTimeBest.score) {
      session.streak.isOverPB = true;
      isGood = true;
    }
  }
  return isGood;
};

exports.alertAboutGoodStreak = function(action, handlerInput) {
  const suggestPause = action == 'stop' || action == 'cancel' && session.streak.isOverPB;
  let prompt = randomItem([
    "You're doing so <prosody pitch='+15%'>great</prosody> in this streak.",
    "You've been quite <prosody pitch='+10%'>good</prosody> in this streak.",
    "You've had such a great streak so far."
  ]);
  if (session.streak.isNearPB) 
    prompt = "You're just a few correct answers away from your personal best.";
  if (session.streak.isOverPB) {
    const personalBest = session.userData[0].allTimeBest[(session.difficulty-8)/4];
    prompt = `This is your longest streak at this level, with ${personalBest.streak} correct answers and ${personalBest.score} points.`;
  }
  if (suggestPause)
    prompt += " <p>If you need to leave just say pause, and your streak will be automatically resumed next time you launch the skill.</p>";
  prompt += " <p>Are you sure you want to quit now?</p>";
  const reprompt = "Are you sure you want to quit this fabulous streak?";
  session.repeat.prompt = prompt;
  session.repeat.reprompt = reprompt;
  session.quitStreak = true;
  const promptIntro = ["Wait. ", "Hang on. "];
  if (suggestPause)
    promptIntro.push("Really? But ");
  session.action = "streak_quit|" + action;
  session.promptIntro = randomItem(["Ok<prosody pitch='low'>then</prosody>. ", "As you wish. ", "Fair enough. ", "Allright<prosody pitch='low'>then</prosody>. "]);
  handlerInput.attributesManager.setSessionAttributes(session);
  return handlerInput.responseBuilder
    .speak(randomItem(promptIntro) + prompt)
    .reprompt(randomPhrase('repromptIntro') + reprompt)
    .getResponse();
};
