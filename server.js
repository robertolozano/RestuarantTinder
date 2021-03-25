'use strict';

let gameID = createId();

// Add the Firebase products that you want to use
var firebase = require("firebase/app");
require("firebase/auth");
require("firebase/firestore");
require("firebase/database");
var firebaseConfig = {
  apiKey: "AIzaSyAB6_0bJialylM_TVYBoJ4AcrYlP76O3P8",
  authDomain: "restauranttinder-ab164.firebaseapp.com",
  projectId: "restauranttinder-ab164",
  storageBucket: "restauranttinder-ab164.appspot.com",
  messagingSenderId: "1014988050165",
  appId: "1:1014988050165:web:f96a75d278696373003fbc",
  measurementId: "G-W8FMWBWEF2"
};
firebase.initializeApp(firebaseConfig);
var database = firebase.database();

//Uses port 5000 if on local machine
var PORT = process.env.PORT || 5000;
const WebSocket = require('ws');
const express = require('express');
const bodyParser = require('body-parser');
const sql = require("sqlite3").verbose();
const http = require('http');
const yelp = require('yelp-fusion');
const client = yelp.client('aJWwPTnE-goeaz8rXnz0yI2nsN2eweeAu28TFozM_QMrNaPeumqL9VYXaMeKE2ppSGxLcWzQthAdc9TAAzJDXteyj6msOq5ftJJwm3EwC4Yn_JV_KxSww_6-lfnEXnYx');

const app = express();
// Serve static files out of public directory
app.use(express.static('public'));
// Serve static files out of /images
app.use("/images",express.static('images'));
// Serve "/" with main page index.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/public/index.html');
});
// Serve "/voter" with voter page.
app.get("/voter", function (request, response) {
  response.sendFile(__dirname + '/public/voter.html');
});
// Returns Restaurant List: Caller = getNextRestaurant() voter.js
app.get("/handleGame", handleGame);
// Starts game and changes view to voter page
app.get("/start", function(req, res){
  console.log("Game Started")
  let startObj = {'type': 'command', 'info': "gamestart", "link": "/voter.html"}
  broadcast(JSON.stringify(startObj));
  res.send("/voter.html")
});

//Searches Yelp API: Caller = Index.html
app.post("/search", express.json(), function (req, res){
  console.log("Searching for " + req.body.term + " in " + req.body.location);
  client.search({
    term: req.body.term,
    location: req.body.location,
  }).then(response => {
    // console.log(response.jsonBody.total);
    load_restaurants(response.jsonBody.businesses)
    res.send("Successfully added restaurants");
  }).catch(e => {
    console.log(e);
  });
});

//Searches Yelp API: Caller = Index.html
app.post("/sendID", express.json(), function (req, res){
  console.log("Received ID " + req.body.id);
  gameID = req.body.id;
});

app.use(bodyParser.json());

//Provides url that users can access game from, will start with waiting page
//From: https://stackoverflow.com/questions/42943124/how-to-get-current-url-path-in-express-with-ejs/42943283
app.get("/startNewGame", function (req, res){
  var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  fullUrl = req.protocol + '://' + req.get('host');
  console.log(fullUrl + "/waiting.html")
  res.send(fullUrl + "/waiting.html");
});

// Web Socket Code
// Create server that allows web socket connections
const server = http.createServer(app);
const wss = new WebSocket.Server({server});

//Occurs everytime a new user connects to ws://---
wss.on('connection', (ws) => {
  clientCount += 1;
  console.log("A new user connected --", clientCount, " users connected");
  console.log("current Round",currentRound);

  ws.on('message', (message) => {
    let voteObj = JSON.parse(message);
    // Check if the message is vote object
    if (voteObj.type == 'vote'){
      //Must vote if ballot votes yes
      if (voteObj.ballot == "yes"){
          console.log("one user selected restaurant with id", voteObj.id);
          vote(voteObj.id); 
      }
      // changing vote value in database anytime someone swipes (left or right)
      totalVotes++;
      console.log("totalVotes: "+totalVotes+" clientCount: " +clientCount+" numRes: "+numRestaurants);
      if(totalVotes == clientCount * numRestaurants){
        currentRound++
        console.log("currentRound was incremented");
        totalVotes = 0;
        if(currentRound == 3){//round3
          chooseRestaurant();
        }
        else{//round 2
          moveNextRound();
          let newRoundObj = {'type': 'newRound'}
          broadcast(JSON.stringify(newRoundObj));
        }
      }
    }
  })

  //Occurs evertime a user disconnects from ws://
  ws.on('close', ()=>{
    clientCount -= 1;
    console.log("A user disconnected --", clientCount, "users connected");
  });

  ws.send('["connected!"]')
})

//Send data to users through web sockets
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

//Global Variables
let currentRestaurantList;
let clientCount = 0; //Number of players connected
let currentRound = 1; //current round, starts at 1->3
let totalVotes = 0;
let numRestaurants = 0;

//Checks if there is a winner
function checkWinner(id, num_clients){
  // cmd = 'SELECT * FROM Restaurants WHERE id == (?)'
  let restInfo = -1;

  // restaurantDB.all(cmd,id, function (err, rows) {
  //   if (err) {} 
  //   else {
  //     // update vote count in database
  //     restInfo = rows[0];
  //     console.log("Round votes is ", restInfo.round_votes)
  //     console.log("num_clients is ", num_clients)
  //     if(restInfo.round_votes == num_clients){
  //       let winnerObj = {'type': 'winner', 'info': restInfo}
  //       broadcast(JSON.stringify(winnerObj));
  //     }
  //   }
  // });

  var selectAll = database.ref('/users/'+gameID+'/restaurants/'+currentRestaurantList[i].id)
  selectAll.once('value', (snapshot) => {
    const data = snapshot.val();
    console.log("This is the data!-------------------", data, "this is the end of checkwinner data");
  });
}

//Change round votes to 0 for next round
function moveNextRound(){
  // cmd = 'UPDATE Restaurants SET round_votes = 0 WHERE id == (?)';
  let i;
  for(i = 0; i < Object.keys(currentRestaurantList).length; i++){
    let currentKey = Object.keys(currentRestaurantList)[i]

    // restaurantD.run(cmd,currentRestaurantList[i].id,function(err){
    //   if(err){
    //     console.log("Error Not ready for next round",err.message);
    //   }
    //   else{
    //     console.log("Ready for next round");
    //   }
    // });

    database.ref('/users/'+gameID+'/restaurants/'+currentRestaurantList[currentKey].id_data).update({
      round_votes_data: 0
    });
  }  
}

//choose highest voted restaurant
function chooseRestaurant(){
  // cmd = 'SELECT * FROM Restaurants ORDER BY round_votes DESC LIMIT 1';

  // restaurantDB.get(cmd, function(err,winner){
  //   if(err){
  //     console.log("Error with finding winner", err.message);
  //   }
  //   else{
  //     console.log("Winner is ",winner.name);
  //     let restInfo = winner;
  //     let winnerObj = {'type': 'winner', 'info': restInfo}
  //     broadcast(JSON.stringify(winnerObj));
  //   }
  // });
  console.log("Begin of chooseRestaurant()---------------------------");
  database.ref('/users/'+gameID+'/restaurants/').orderByChild('total_votes_data').limitToLast(1).once('value', (snapshot) => {
    const winner = snapshot.val();
    let currentKey = Object.keys(winner)[0]
    console.log(currentKey);
    console.log(winner);
    console.log(winner[currentKey]);

    let finalWinner = winner[currentKey]
    console.log(finalWinner)
    console.log("Winner is ", finalWinner.name_data);
    let restInfo = finalWinner;
    let winnerObj = {'type': 'winner', 'info': restInfo}
    broadcast(JSON.stringify(winnerObj));
  });
}

//Alters vote value in database then checks for winner
function vote(id){
  console.log("placed a vote")
  // cmd = 'SELECT * FROM Restaurants WHERE id == (?)'
  // restaurantDB.all(cmd,id, function (err, rows1) {
  //   if (err) {} 
  //   else {
  //     // update vote count in database
  //     let vote_tally = rows1[0].round_votes + 1
  //     let total_vote_tally = rows1[0].total_votes + 1
  //     let update = "UPDATE Restaurants SET round_votes=(?), total_votes=(?) WHERE id==(?)"
  //     restaurantDB.run(update, vote_tally, total_vote_tally, id, function(err,rows2){
  //       if(err){} 
  //       else{
  //         console.log("Added a vote for ", rows1[0].name,  vote_tally)
  //         checkWinner(id, clientCount)
  //       }
  //     });
  //   }
  // });

  var selectAll = database.ref('/users/'+gameID+'/restaurants/'+id)
  selectAll.once('value', (snapshot) => {
    const data = snapshot.val();
    console.log("This is the data!-------------------", data, "this is the end of vote data");

    let round_vote_tally = data.round_votes_data + 1
    let total_vote_tally = data.total_votes_data + 1

    database.ref('/users/'+gameID+'/restaurants/'+id).update({
      round_votes_data: round_vote_tally
    });    
    database.ref('/users/'+gameID+'/restaurants/'+id).update({
      total_votes_data: total_vote_tally
    });    
  });
}


// creates database in file restaurants.db if it does not exists
// const restaurantDB = new sql.Database("restaurants.db");

// let cmd = " SELECT name FROM sqlite_master WHERE type='table' AND name='Restaurants' ";

// restaurantDB.get(cmd, function (err, val) {
//     console.log(err, val);
//     if (val == undefined) {
//         console.log("No database file - creating one");
//         createRestaurantDB();
//     } 
//     else {
//         console.log("Database file found");
//     }
// });

function createRestaurantDB() {
  // const cmd = 'CREATE TABLE Restaurants ( id TEXT , name TEXT, rating DECIMAL, image_url TEXT, reviews TEXT, price TEXT, location TEXT, round_votes INT, total_votes INT)';
  // restaurantD.run(cmd, function(err, val) {
  //   if (err) {
  //     console.log("Database creation failure",err.message);
  //   } 
  //   else {
  //     console.log("Created database");
  //   }
  // });
}

// Removes entries from previous games from database
// Resets round back = 1, totalvotes = 0, numRestaurants = 0
function resetGame(){
  currentRound = 1;
  totalVotes = 0;
  numRestaurants = 0;
  // const delcmd = 'DELETE FROM Restaurants';
  // restaurantD.run(delcmd, function(err, val) {
  //   if (err) {
  //     console.log("Database reset failure.",err.message);
  //   }
  //   else {
  //     console.log("Database has been reset");
  //   }
  // });
}

// Add business to database
function load_restaurants(businessList){
  resetGame()
  let i = 0;
  for (i = 0; i < 16; i++) {
    let id = businessList[i].id
    let name = businessList[i].name
    let rating = businessList[i].rating
    let image_url = businessList[i].image_url
    // let review_count = businessList[i].review_count
    let price = businessList[i].price
    let total_votes = 0
    let round_votes = 0
    let reviews = "noreviews";
    let location = JSON.stringify(businessList[i].location);

    if (price == undefined){
      price = 0
    }

    // let gameID = 0
    database.ref('/users/'+gameID+'/restaurants/'+id+'/').set({
      id_data: id,
      name_data: name,
      rating_data: rating, 
      image_url_data: image_url, 
      reviews_data: reviews, 
      price_data: price, 
      location_data: location, 
      round_votes_data:round_votes,
      total_votes_data: total_votes
    });

    load_reviews(businessList, i);
  }
}

function load_reviews(businessList, i){
  // cmd = 'UPDATE Restaurants SET reviews=(?) WHERE id ==(?)';
  console.log(businessList[i].name + "------------------------------------------")
  client.reviews(businessList[i].id).then(response => {
    let rev = JSON.stringify(response.jsonBody.reviews)

    database.ref('/users/'+gameID+'/restaurants/'+businessList[i].id).update({
      reviews_data: JSON.stringify(rev)
    });

  }).catch(e => {
  });
}


function handleGame(request, response, next) {
  if(currentRound == 1){//Returns all restaurants
    // cmd = 'SELECT * FROM Restaurants';
    var selectAll = database.ref('/users/'+gameID+'/restaurants')
    selectAll.once('value', (snapshot) => {
      const data = snapshot.val();

      currentRestaurantList = data;
      numRestaurants = Object.keys(data).length;
      console.log("Number of restaurants during this round", numRestaurants)
      console.log("This is the data!-------------------", data, "this is the end of handlegame data round1");
      response.json(data);
    });
  }
  if(currentRound == 2){//Returns only restaurants with more than 0 votes
    // cmd = "SELECT * FROM Restaurants WHERE total_votes > 0";
    console.log("start of round 2")
    database.ref('/users/'+gameID+'/restaurants/').orderByChild('total_votes_data').startAt(1).once('value', (snapshot) => {
      const data = snapshot.val();
      
      currentRestaurantList = data;
      numRestaurants = Object.keys(data).length;
      console.log("Number of restaurants during this round", numRestaurants)
      console.log("This is the data!-------------------", data, "this is the end of handlegame data round1");
      response.json(data);      
    });
  }

  // restaurantDB.all(cmd, function (err, rows) {
  //   if (err) {
  //     next();
  //   } else {
  //     response.json(rows);
  //     currentRestaurantList = rows; //need this for when votes are reset
  //     numRestaurants = Object.keys(rows).length;
  //   }
  // });
}

// listen for requests :)
var listener = server.listen(PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});

//for creating random id although not in use rn
function createId() {
  var result           = '';
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < 22; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}