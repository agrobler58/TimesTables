const moment = require('moment');

const AWS = require("aws-sdk");
AWS.config.update({
  region: "us-east-1",
  endpoint: "https://dynamodb.us-east-1.amazonaws.com"
});

const table = "TimesTables";

const answersCreate = function(userData, factor) {

  const answers = {
    userId: userData[0].userId, 
    factor: factor,
    incorrect: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    lastTime: moment.utc().format()
  };

  return new Promise((resolve, reject) => {
    
    const docClient = new AWS.DynamoDB.DocumentClient();
    const params = {
      TableName: table,
      Item: answers
    };

    docClient.put(params, function(err, data) {
      if (err) {
        console.error("Unable to create item. Error JSON:", JSON.stringify(err, null, 2));
        reject({ message: err, success: false});
      } else {
        userData[factor] = answers;
        resolve({ data: userData, success: true});
      }
    });

  });
};

const answersUpdate = async function(userData, factors) {

  const docClient = new AWS.DynamoDB.DocumentClient();
  const userId = userData[0].userId;
  const timeUpdated = moment.utc().format();
  
  // build an array of update promises, one for each factor
  const updates = [];
  factors.forEach(factor => {
    factor *= 1;
    updates.push(
      new Promise((resolve, reject) => {

        const answers = userData[factor];
        const params = {
            TableName: table,
            Key: {
              "userId": userId,
              "factor": factor
            },
            UpdateExpression: "set lastTime = :t, incorrect = :i remove attempts, correct",
            ExpressionAttributeValues: {
                ":i": answers.incorrect,
                ":t": timeUpdated
            },
            ReturnValues: "UPDATED_NEW"
          };
    
          docClient.update(params, function(err, data) {
            if (err) {
              console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
              reject({ message: err, success: false });
            } else {
              resolve({ success: true });
            }
          });
      })
    );
  });
  
  // execute all updates in parralel
  const results = await Promise.all(updates);
  
  // make sure all is good
  results.forEach(result => {
    if (!result.success)
      return result.message;
  });

  return "";
};

module.exports = {
  answersCreate: answersCreate,
  answersUpdate: answersUpdate
};