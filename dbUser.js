const crypto = require('crypto');
const moment = require('moment');

const AWS = require("aws-sdk");
AWS.config.update({
  region: "us-east-1",
  endpoint: "https://dynamodb.us-east-1.amazonaws.com"
});

const table = "TimesTables";

const getUserData = function(alexaUserId, country=null, postalCode=null, age=null) {
  
  return new Promise((resolve, reject) => {

    const hashedUserId = crypto.createHash('sha256').update(alexaUserId).digest('base64');
    const now = moment.utc();
    const userData = [];

    const docClient = new AWS.DynamoDB.DocumentClient();
    const params = {
      TableName: table,
      Key: {
        userId: hashedUserId,
        factor: 0
      }
    };

    docClient.get(params, function(err, data) {
      if (err) {
        console.error("Unable to get item. Error JSON:", JSON.stringify(err, null, 2));
        reject({ message: err, success: false});
      } else {
       
        if (data.Item) { // existing user
          userData[0] = data.Item;

          var params = {
            TableName: table,
            ProjectionExpression: "factor, incorrect, lastTime",
            KeyConditionExpression: "#usr = :hashedUserId and factor between :fMin and :fMax",
            ExpressionAttributeNames:{
              "#usr": "userId"
            },
            ExpressionAttributeValues: {
              ":hashedUserId": hashedUserId,
              ":fMin": 2,
              ":fMax": 16
            }
          };
        
          docClient.query(params, function(err, data) {
            if (err) {
              console.log("Unable to query. Error:", JSON.stringify(err, null, 2));
              reject({ message: err, success: false});
            } else {
              data.Items.forEach(item => userData[item.factor] = item);
              resolve({ data: userData, success: true});
            }
          });
       
        } else {         // new user, create
          const month = now.month();
          const item = {
            userId: hashedUserId,
            factor: 0,  // 0 indicates head record, distinct from answers tables with factors 2 - 16
            level: 0,   // 0 = easy (8), 1 = moderate (12), 2 = hard (16)
            dateJoined: now.format(),
            monthlyBest: [
              { score: 0, streak: 0, runs: 0, month: month }, 
              { score: 0, streak: 0, runs: 0, month: month }, 
              { score: 0, streak: 0, runs: 0, month: month }],
            allTimeBest: [
              { score: 0, streak: 0, runs: 0}, 
              { score: 0, streak: 0, runs: 0}, 
              { score: 0, streak: 0, runs: 0}]
          };
          if (country) { // used for streak competition
            item.country = country;
            item.postalCode = postalCode;
          }
          if (age) { // used for streak competition
            item.age = age;
            item.ageGiven = now.format();
          }

          const params = {
            TableName: table,
            Item: item
          };
    
          docClient.put(params, function(err, data) {
            if (err) {
              console.error("Unable to create item. Error JSON:", JSON.stringify(err, null, 2));
              reject({ message: err, success: false});
            } else {
              console.log("successfullty created new user " + hashedUserId);
              userData[0] = item;
              resolve({ data: userData, success: true});
            }
          });
        }
      }
    });

  });
};

const updateUserData = function(userData, localityUpdated, ageUpdated) {
  
  return new Promise((resolve, reject) => {

    const now = moment.utc();
    const userInfo = userData[0];
    let updateExpression = "set monthlyBest = :m, allTimeBest = :a, #lvl = :l";
    const expressionAttributeValues = {
      ":m": userInfo.monthlyBest,
      ":a": userInfo.allTimeBest,
      ":l": userInfo.level
    };

    if (localityUpdated) {
      updateExpression += ", country = :c, postalCode = :p";
      expressionAttributeValues[":c"] = userInfo.country;
      expressionAttributeValues[":p"] = userInfo.postalCode;
    }

    if (ageUpdated) {
      updateExpression += ", age = :y, ageGiven = :g";
      expressionAttributeValues[":y"] = userInfo.age;
      expressionAttributeValues[":g"] = now.format();
    }

    if (userInfo.streak) {
      updateExpression += ", streak = :s";
      expressionAttributeValues[":s"] = userInfo.streak;
    } else {
      updateExpression += " remove streak";
    }

    if (userInfo.listAccess) {
      updateExpression += ", listAccess = :la";
      expressionAttributeValues[":la"] = userInfo.listAccess;
    } 

    const docClient = new AWS.DynamoDB.DocumentClient();
    const params = {
      TableName: table,
      Key: {
        "userId": userInfo.userId,
        "factor": 0
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { "#lvl": "level" },
      ExpressionAttributeValues: expressionAttributeValues,
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

  });
};

const deleteUserData = async function(userData) {
  
  const docClient = new AWS.DynamoDB.DocumentClient();
  const userId = userData[0].userId;
  // build an array of update promises, one for each factor
  const deletes = [];
 
  userData.forEach(row => {
    deletes.push(
      new Promise((resolve, reject) => {

        const params = {
            TableName: table,
            Key: {
              "userId": userId,
              "factor": row.factor
            },
          };
    
          docClient.delete(params, function(err, data) {
            if (err) {
              console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
              reject({ message: err, success: false });
            } else {
              console.log("DeleteItem succeeded. User: " + userId + ", Factor: " + row.factor, JSON.stringify(data, null, 2));
              resolve({ success: true });
            }
          });
      })
    );
  });

  // execute all deletes in parralel
  const results = await Promise.all(deletes);
  
  // make sure all is good
  results.forEach(result => {
    if (!result.success)
      return result.message;
  });

  return "";
};

module.exports = {
  getUserData: getUserData,
  updateUserData: updateUserData,
  deleteUserData: deleteUserData
};
