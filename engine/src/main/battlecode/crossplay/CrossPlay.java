package battlecode.crossplay;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import battlecode.common.GameActionException;
import battlecode.common.RobotController;
import battlecode.common.Team;
import battlecode.instrumenter.stream.RoboPrintStream;
import battlecode.server.Server;

/**
 * Allows bots written in different languages to be run by the Java engine using a message-passing system.
 * Battlecode 2026 supports Java and Python.
 */
public class CrossPlay {
    private static final int IPC_PORT = 27185;

    private RobotController processingRobot;
    private OutputStream out;
    private ServerSocket serverSocket;
    private Socket socket;
    private DataInputStream socketIn;
    private DataOutputStream socketOut;

    private final ObjectMapper objectMapper;

    public CrossPlay() {
        this.objectMapper = new ObjectMapper();
    }

    private void initSocket() {
        if (socket != null) return;

        Server.debug("Init crossplay socket");
        try {
            serverSocket = new ServerSocket(IPC_PORT);
            socket = serverSocket.accept();

            Server.debug("Crossplay connection accepted");

            socketIn = new DataInputStream(socket.getInputStream());
            socketOut = new DataOutputStream(socket.getOutputStream());
        } catch (IOException e) {
            throw new CrossPlayException("Failed to initialize CrossPlay socket IPC: " + e.toString());
        }
    }

    private void sendJson(JsonNode json) throws IOException {
        Server.debug("Sending json: " + json.toString());
        initSocket();
        byte[] bytes = objectMapper.writeValueAsBytes(json);
        socketOut.writeInt(bytes.length);
        socketOut.write(bytes);
        socketOut.flush();
    }

    private JsonNode receiveJson() throws IOException {
        initSocket();
        int len = socketIn.readInt();
        byte[] bytes = socketIn.readNBytes(len);
        return objectMapper.readTree(bytes);
    }

    public void cleanup() {
        try {
            sendEndGame();
        } catch (Exception e) {}
        
        try {
            if (socket != null) socket.close();
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {}
    }

    public int runMessagePassing() throws GameActionException, CrossPlayException {
        while (true) {
            try {
                JsonNode messageJson = receiveJson();
                CrossPlayMessage message = objectMapper.treeToValue(messageJson, CrossPlayMessage.class);

                JsonNode result = processMessage(message);
                sendJson(result);

                if (message.method() == CrossPlayMethod.END_TURN) {
                    if (message.params() != null && message.params().isArray() && message.params().size() > 0) {
                        return message.params().get(0).asInt();
                    }
                    return 0;
                }

            } catch (JsonProcessingException e) {
                throw new CrossPlayException("Protocol error: Invalid JSON received from client: " + e.getMessage());
            } catch (IllegalArgumentException e) {
                throw new CrossPlayException("Protocol error: Failed to map JSON to CrossPlayMessage: " + e.getMessage());
            } catch (IOException e) {
                throw new CrossPlayException("Socket IPC failed: " + e.toString());
            }
        }
    }

    private JsonNode processMessage(CrossPlayMessage message) {
        JsonNodeFactory nodeFactory = objectMapper.getNodeFactory();

        switch (message.method()) {
            case INVALID:
                throw new CrossPlayException("Received invalid cross-play method!");

            case END_TURN:
                return nodeFactory.nullNode(); // Or object with type NULL if strict backward compat needed, but assuming raw JSON now.

            case RC_GET_ROUND_NUM:
                return nodeFactory.numberNode(this.processingRobot.getRoundNum());

            case RC_GET_MAP_WIDTH:
                return nodeFactory.numberNode(this.processingRobot.getMapWidth());

            case RC_GET_MAP_HEIGHT:
                return nodeFactory.numberNode(this.processingRobot.getMapHeight());

            case LOG:
                if (message.params() != null && message.params().isArray() && message.params().size() > 0) {
                    String msg = message.params().get(0).asText();
                    if (this.out instanceof RoboPrintStream rps) {
                        rps.println(msg);
                    }
                }
                return nodeFactory.nullNode();

            default:
                throw new CrossPlayException("Received unknown cross-play method: " + message.method());
        }
    }

    private void sendStartTurn() {
        JsonNodeFactory nodeFactory = objectMapper.getNodeFactory();
        ObjectNode startTurn = nodeFactory.objectNode();
        startTurn.put("type", "start_turn");
        startTurn.put("round", this.processingRobot.getRoundNum());
        startTurn.put("team", this.processingRobot.getTeam().ordinal());
        startTurn.put("id", this.processingRobot.getID());

        try {
            sendJson(startTurn);
        } catch (IOException e) {
             throw new CrossPlayException("Failed to send start turn: " + e.toString());
        }
    }
    
    public void sendSpawnBot(int id, Team team) {
        JsonNodeFactory nodeFactory = objectMapper.getNodeFactory();
        ObjectNode spawnBot = nodeFactory.objectNode();
        spawnBot.put("type", "spawn_bot");
        spawnBot.put("id", id);
        spawnBot.put("team", team.ordinal());
        
        try {
            sendJson(spawnBot);
        } catch (IOException e) {
            throw new CrossPlayException("Failed to send spawn bot: " + e.toString());
        }
    }
    
    public void sendDestroyBot(int id) {
        // If socket isn't initialized, we can't send destroy message, but that's fine 
        // because it means no bots have been spawned or connected yet.
        if (socket == null) return;
        
        JsonNodeFactory nodeFactory = objectMapper.getNodeFactory();
        ObjectNode destroyBot = nodeFactory.objectNode();
        destroyBot.put("type", "destroy_bot");
        destroyBot.put("id", id);
        
        try {
            sendJson(destroyBot);
        } catch (IOException e) {
            throw new CrossPlayException("Failed to send destroy bot: " + e.toString());
        }
    }
    
    public void sendEndGame() {
        if (socket == null) return;
        
        JsonNodeFactory nodeFactory = objectMapper.getNodeFactory();
        ObjectNode endGame = nodeFactory.objectNode();
        endGame.put("type", "end_game");
        
        try {
            sendJson(endGame);
        } catch (IOException e) {
            // Ignore errors during cleanup
        }
    }

    public int playTurn(RobotController rc, OutputStream systemOut) throws GameActionException {
        this.processingRobot = rc;
        this.out = systemOut;

        // Send start turn message to prime the client
        this.sendStartTurn();

        return runMessagePassing();
    }
}
