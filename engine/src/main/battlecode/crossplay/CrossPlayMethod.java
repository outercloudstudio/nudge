package battlecode.crossplay;

import com.fasterxml.jackson.annotation.JsonFormat;

@JsonFormat(shape = JsonFormat.Shape.NUMBER_INT)
public enum CrossPlayMethod {
    INVALID,
    START_TURN,
    END_TURN,
    RC_GET_ROUND_NUM,
    RC_GET_MAP_WIDTH,
    RC_GET_MAP_HEIGHT,
    LOG,
    // TODO add more methods
    ;

    public static final CrossPlayMethod[] values = values();
}
