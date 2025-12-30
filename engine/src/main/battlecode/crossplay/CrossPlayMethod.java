package battlecode.crossplay;

public enum CrossPlayMethod {
    INVALID,
    TERMINATE,
    START_TURN,
    RC_GET_ROUND_NUM,
    RC_GET_MAP_WIDTH,
    RC_GET_MAP_HEIGHT,
    LOG,
    // TODO add more methods
    ;

    public static final CrossPlayMethod[] values = values();
}
