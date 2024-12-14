const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const { randomInt } = require('crypto');
const { stat } = require('fs');
const port = process.env.PORT || 3000
var app = express();
app.set('view engine', 'ejs');
let server = http.createServer(app);
var io = socketIO(server);

var status = {
    //list[socket]
    waiting:[],
    //socketid:opponentsocket
    playing:{},
}

//socket:game
var games = {

}

var endGame = (socket) => {
    delete games[socket.id];
    let opponent = status.playing[socket.id];
    delete status.playing[socket.id];
    if(opponent != undefined){
        delete games[opponent.id];
        delete status.playing[opponent.id];
    }
}

var checkWin = (board)=>{
    //rows
    {
        let idx = 0;
        while(idx < 3){
            let one = board[idx][0];
            let two = board[idx][1];
            let three = board[idx][2];
            if(one != 0 && one == two && two == three){
                return one;
            }
            idx += 1;
        }
    }

    //cols
    {
        let idx = 0;
        while(idx < 3){
            let one = board[0][idx];
            let two = board[1][idx];
            let three = board[2][idx];
            if(one != 0 && one == two && two == three){
                return one;
            }
            idx += 1;
        }
    }
    //diagonals
    {
        let one = board[0][0];
        let two = board[1][1];
        let three = board[2][2];
        if(one != 0 && one == two && two == three){
            return one;
        }
    }
    {
        let one = board[0][2];
        let two = board[1][1];
        let three = board[2][0];
        if(one != 0 && one == two && two == three){
            return one;
        }
    }
    //Draw?
    {
        let noZero = true;
        for (let i = 0; i < 3; i++) {
            for (let k = 0; k < 3; k++) {
                if (board[i][k] == 0){
                    noZero = false
                    break;
                }
            }
            if (!noZero)
                break;
        }
        if(noZero){
            return -1;
        }
    }
    //If no one won nor drawn
    return 0;
}

var queue_or_matchup_players = (socket) => {
    if (status.waiting.length != 0){
        let opponent = status.waiting.pop();
        let players = [socket,opponent];
        let rdm = randomInt(2);
        let first = players[rdm];
        let second = players[(rdm+1)%2];
        let game = {
            board:[[0,0,0],[0,0,0],[0,0,0]],
            turn:first.id,
            next:second.id,
        };
        game[first.id] = 1; // X or O
        game[second.id] = 2;
        status.playing[socket.id] = opponent;
        status.playing[opponent.id] = socket;
        games[socket.id] = game;
        games[opponent.id] = game;
        socket.emit('Found',{msg:"Found an opponent!"});
        opponent.emit('Found',{msg:"Found an opponent!"});
        first.emit("boardState",{board:game.board,turn:"yours",char:1});
        second.emit("boardState",{board:game.board,turn:"not yours",char:2});
    }
    else{
        status.waiting.push(socket);
        socket.emit('Waiting',{msg:"No opponents found. Waiting..."});
    }
}

// make connection with user from server side
io.on('connection',
    (socket) => {
        console.log('New user connected');
        //emit message from server to user
        
        queue_or_matchup_players(socket);

        socket.on("replay",()=>{
            if(socket in games || socket in status.waiting)
                return;
            queue_or_matchup_players(socket);
        })

        socket.on('playReq',(preq)=>{
            console.log(preq)
            if(socket.id in games){
                let game = games[socket.id];
                if (game.turn != socket.id){
                    return;
                }
                let row = preq.row;
                let col = preq.col;
                if(game.board[row][col] != 0){
                    return;
                }
                game.board[row][col] = game[socket.id];
                //Let opponent know
                let opponent = status.playing[socket.id];
                game.turn = opponent.id;
                game.next = socket.id;
                let res = checkWin(game.board)
                console.log(res);
                if(res == 0){
                    socket.emit("boardState",{board:game.board,turn:"not yours",
                        char:game[socket.id]});
                    opponent.emit("boardState",{board:game.board,turn:"yours",
                        char:game[opponent.id]});
                }
                else{
                    socket.emit("winner",{board:game.board,winner:res,char:game[socket.id]});
                    opponent.emit("winner",{board:game.board,winner:res,char:game[opponent.id]});
                    endGame(socket);
                }
                
            }
        });

        // when server disconnects from user
        socket.on('disconnect',
            () => {
                console.log('disconnected from user');
                let idx = status.waiting.indexOf(socket);
                if(idx != -1){
                    status.waiting.splice(idx,1);
                }
                delete games[socket.id];
                let opponent = status.playing[socket.id];
                delete status.playing[socket.id];
                if(opponent != undefined){
                    opponent.emit('opponentGone',{msg:"opponent has disconnected"});
                    delete games[opponent.id];
                    delete status.playing[opponent.id];
                }
            });
    });

app.get("/",
    (req, res) => {
        res.render("client");
    });

server.listen(port);