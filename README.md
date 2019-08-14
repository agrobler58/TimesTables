# Times Tables Streak
This is the code for the AWS Lambda function that services Amaxon Alexa skill [Times Tables Streak](https://www.amazon.com/Andrej-Grobler-Times-Tables-Streak/dp/B07GWLK3NZ).

Alexa triggers the Lambda which in turn hadles the session based on the skill intent submitted in the request.

Skill is called Times Tables Streak because the user can play a streak game: Alexa tests the user with multiplication and division questions 
and problems and the user tries to answer as many as possible in a row. First wrong answer, and the streak is broken.

Code uses AWS DynamoDB to store the best result for each user, so users can try to beat their personal best in subsequent sessions.

