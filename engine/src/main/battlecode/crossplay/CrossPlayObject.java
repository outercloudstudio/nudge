package battlecode.crossplay;

import org.json.*;

public abstract class CrossPlayObject {
    public final CrossPlayObjectType type;

    public CrossPlayObject(CrossPlayObjectType type) {
        this.type = type;
    }

    @Override
    public String toString() {
        return "CrossPlayObject(type=" + type + ")";
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        json.put("type", this.type.ordinal());
        return json;
    }

    public static CrossPlayObject fromJson(JSONObject json) {
        if (json.has("value")) {
            return CrossPlayLiteral.fromJson(json);
        } else if (json.has("oid")) {
            return CrossPlayReference.fromJson(json);
        } else if (json.getInt("type") == CrossPlayObjectType.CALL.ordinal()) {
            return CrossPlayMessage.fromJson(json);
        } else {
            throw new CrossPlayException("Invalid CrossPlayObject JSON: " + json.toString());
        }
    }
}
