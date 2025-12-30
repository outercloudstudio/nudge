package battlecode.crossplay;

import java.util.ArrayList;
import org.json.*;

import java.io.IOException;
import java.nio.file.*;

import battlecode.common.*;

/**
 * Allows bots written in different languages to be run by the Java engine using a message-passing system.
 * Any language can be supported as long as a file analogous to runner.py is written.
 * Battlecode 2026 supports Java and Python.
 */
public class CrossPlay {
    public static final String
        CROSS_PLAY_DIR = "crossplay_temp", // temporary directory for cross-play files
        MESSAGE_FILE_JAVA = "messages_java.json", // messages from the java engine
        MESSAGE_FILE_OTHER = "messages_other.json", // messages from the other language's runner script
        LOCK_FILE_JAVA = "lock_java.txt", // lock file created by the java engine
        LOCK_FILE_OTHER = "lock_other.txt"; // lock file created by the other language's runner script

    private ArrayList<Object> objects;
    private RobotController rc;
    private int roundNum;
    private Team team;
    private int id;
    private CrossPlayReference rcRef;

    public CrossPlay() {
        this.objects = new ArrayList<>();
    }

    private void clearObjects() {
        this.objects.clear();
    }

    public static void resetFiles() {
        try {
            Path crossPlayDir = Paths.get(CROSS_PLAY_DIR);

            if (!Files.exists(crossPlayDir) || !Files.isDirectory(crossPlayDir)) {
                Files.createDirectory(crossPlayDir);
            }

            Files.deleteIfExists(crossPlayDir.resolve(MESSAGE_FILE_JAVA));
            Files.deleteIfExists(crossPlayDir.resolve(MESSAGE_FILE_OTHER));
            Files.deleteIfExists(crossPlayDir.resolve(LOCK_FILE_JAVA));
            Files.deleteIfExists(crossPlayDir.resolve(LOCK_FILE_OTHER));
        } catch (Exception e) {
            throw new CrossPlayException("Failed to clear cross-play lock files.");
        }
    }

    public static void clearTempFiles() {
        try {
            Path crossPlayDir = Paths.get(CROSS_PLAY_DIR);

            if (Files.exists(crossPlayDir)) {
                Files.deleteIfExists(crossPlayDir.resolve(MESSAGE_FILE_JAVA));
                Files.deleteIfExists(crossPlayDir.resolve(MESSAGE_FILE_OTHER));
                Files.deleteIfExists(crossPlayDir.resolve(LOCK_FILE_JAVA));
                Files.deleteIfExists(crossPlayDir.resolve(LOCK_FILE_OTHER));
                Files.delete(crossPlayDir);
            }
        } catch (Exception e) {
            throw new CrossPlayException("Failed to clear cross-play lock files.");
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T getLiteralValue(CrossPlayObject obj) {
        if (obj instanceof CrossPlayLiteral lit) {
            Object value = lit.value;

            try {
                return (T) value;
            } catch (ClassCastException e) {
                throw new CrossPlayException("Tried to get object of type " + obj.type + " but it does not match expected type.");
            }
        } else {
            throw new CrossPlayException("Tried to get value of non-literal cross-play object");
        }
    }

    @SuppressWarnings("unchecked")
    private <T> T getObject(CrossPlayObject obj) {
        if (obj instanceof CrossPlayReference ref) {
            Object rawObj = this.objects.get(ref.objectId);

            try {
                return (T) rawObj;
            } catch (ClassCastException e) {
                throw new CrossPlayException("Tried to get object of type " + obj.type + " but it does not match expected type.");
            }
        } else {
            throw new CrossPlayException("Tried to retrieve Java value of non-reference cross-play object");
        }
    }

    private void setObject(CrossPlayReference ref, Object value) {
        if (ref.objectId >= this.objects.size()) {
            // extend the array
            for (int i = this.objects.size(); i <= ref.objectId; i++) {
                this.objects.add(null);
            }
        }

        this.objects.set(ref.objectId, value);
    }

    private CrossPlayReference setNextObject(CrossPlayObjectType type, Object value) {
        CrossPlayReference ref = new CrossPlayReference(type, this.objects.size());
        setObject(ref, value);
        return ref;
    }

    public void runMessagePassing() {
        Path crossPlayDir = Paths.get(CROSS_PLAY_DIR);
        Path javaMessagePath = crossPlayDir.resolve(MESSAGE_FILE_JAVA);
        Path otherMessagePath = crossPlayDir.resolve(MESSAGE_FILE_OTHER);
        Path javaLockPath = crossPlayDir.resolve(LOCK_FILE_JAVA);
        Path otherLockPath = crossPlayDir.resolve(LOCK_FILE_OTHER);
        // System.out.println("Waiting for message Python -> Java...");

        while (true) {
            try {
                if (!Files.exists(otherMessagePath) || Files.exists(javaMessagePath) || Files.exists(otherLockPath)) {
                    Thread.sleep(100, 0); // TODO make shorter: sleep for 0.1 s
                    // System.out.println("Still waiting for message Python -> Java...");
                    continue;
                }

                if (Files.exists(javaLockPath)) {
                    throw new CrossPlayException("Detected existing java lock file while waiting for other language's message."
                        + " This should never happen under normal operation.");
                }

                Files.createFile(javaLockPath);
                String messageContent = Files.readString(otherMessagePath);
                JSONObject messageJson = new JSONObject(messageContent);
                CrossPlayMessage message = CrossPlayMessage.fromJson(messageJson);

                // System.out.println("Received message Python -> Java: " + messageJson.toString());

                if (message.method == CrossPlayMethod.TERMINATE) {
                    Files.delete(otherMessagePath);
                    Files.delete(javaLockPath);
                    // System.out.println("Received terminate message, ending cross-play message passing.");
                    break;
                }

                CrossPlayObject result = processMessage(message);
                String resultContent = result.toJson().toString();
                Files.writeString(javaMessagePath, resultContent);

                Files.delete(otherMessagePath);
                Files.delete(javaLockPath);

                // System.out.println("Sent response Java -> Python: " + resultContent);
                // System.out.println("Waiting for message Python -> Java...");
            } catch (InterruptedException e) {
                throw new CrossPlayException("Cross-play message passing thread was interrupted.");
            } catch (IOException e) {
                throw new CrossPlayException("Failed to read other language's cross-play message file.");
            }
        }
    }

    // private JSONArray processJsonMessages(JSONArray json) {
    //     System.out.println("Starting cross-play message processing...");
    //     int length = json.length();
    //     JSONObject[] resultsArr = new JSONObject[length];

    //     for (int i = 0; i < length; i++) {
    //         JSONObject messageJson = json.getJSONObject(i);
    //         CrossPlayMessage message = CrossPlayMessage.fromJson(messageJson);
    //         CrossPlayObject result = processMessage(message);
    //         JSONObject resultJson = result.toJson();
    //         resultsArr[i] = resultJson;
    //     }

    //     JSONArray resultsJson = new JSONArray(resultsArr);
    //     System.out.println("Finished cross-play message processing.");
    //     return resultsJson;
    // }

    private CrossPlayObject processMessage(CrossPlayMessage message) {
        CrossPlayObject[] computedParams = new CrossPlayObject[message.params.length];

        for (int i = 0; i < message.params.length; i++) {
            CrossPlayObject param = message.params[i];

            if (param instanceof CrossPlayMessage mess) {
                CrossPlayObject innerResult = processMessage(mess);
                computedParams[i] = getObject(innerResult);
            } else {
                computedParams[i] = param;
            }
        }

        CrossPlayObject result;
        RobotController rc;

        // TODO add cases for all methods
        switch (message.method) {
            case INVALID:
                throw new CrossPlayException("Received invalid cross-play method!");
            case TERMINATE:
                throw new CrossPlayException("Terminate messages should be handled outside of processMessage.");
            case START_TURN:
                result = new CrossPlayLiteral(CrossPlayObjectType.ARRAY, new CrossPlayObject[] {
                    this.rcRef,
                    new CrossPlayLiteral(CrossPlayObjectType.INTEGER, this.roundNum),
                    new CrossPlayLiteral(CrossPlayObjectType.TEAM, this.team),
                    new CrossPlayLiteral(CrossPlayObjectType.INTEGER, this.id),
                    new CrossPlayLiteral(CrossPlayObjectType.BOOLEAN, false),
                });
                break;
            case RC_GET_ROUND_NUM:
                rc = this.<RobotController>getObject(computedParams[0]);
                result = new CrossPlayLiteral(CrossPlayObjectType.INTEGER, rc.getRoundNum());
                break;
            case RC_GET_MAP_WIDTH:
                rc = this.<RobotController>getObject(computedParams[0]);
                result = new CrossPlayLiteral(CrossPlayObjectType.INTEGER, rc.getMapWidth());
                break;
            case RC_GET_MAP_HEIGHT:
                rc = this.<RobotController>getObject(computedParams[0]);
                result = new CrossPlayLiteral(CrossPlayObjectType.INTEGER, rc.getMapHeight());
                break;
            case LOG:
                String msg = getLiteralValue(computedParams[0]);
                System.out.println(msg);
                result = new CrossPlayLiteral(CrossPlayObjectType.NULL, null);
                break;
            default:
                throw new CrossPlayException("Received unknown cross-play method: " + message.method);
        }

        return result;
    }

    public void playTurn(RobotController rc) {
        this.rc = rc;
        this.roundNum = rc.getRoundNum();
        this.team = rc.getTeam();
        this.id = rc.getID();

        if (this.roundNum == 1) {
            clearObjects();
            this.rcRef = setNextObject(CrossPlayObjectType.ROBOT_CONTROLLER, this.rc);
            System.out.println("Cross-play bot initialized!");
        } else {
            this.rcRef = new CrossPlayReference(CrossPlayObjectType.ROBOT_CONTROLLER, 0);
        }
        
        runMessagePassing();
    }
}
