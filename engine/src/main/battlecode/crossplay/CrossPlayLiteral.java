package battlecode.crossplay;

import battlecode.common.Team;

import org.json.*;

public class CrossPlayLiteral extends CrossPlayObject {
    public final Object value;

    public CrossPlayLiteral(CrossPlayObjectType type, Object value) {
        super(type);
        this.value = value;
    }

    @Override
    public String toString() {
        return "CrossPlayLiteral(type=" + type + ", value=" + value + ")";
    }

    @Override
    public JSONObject toJson() {
        JSONObject json = super.toJson();

        switch (this.type) {
            case NULL:
                json.put("value", 0);
                break;
            case BOOLEAN:
                json.put("value", (Boolean)this.value);
                break;
            case INTEGER:
                json.put("value", (Integer)this.value);
                break;
            case DOUBLE:
                json.put("value", (Double)this.value);
                break;
            case STRING:
                json.put("value", (String)this.value);
                break;
            case ARRAY:
                JSONArray jsonArr = new JSONArray();

                for (CrossPlayObject obj : (CrossPlayObject[])this.value) {
                    jsonArr.put(obj.toJson());
                }

                json.put("value", jsonArr);
                break;
            case TEAM:
                json.put("value", ((Team)this.value).ordinal());
                break;
            default:
                throw new CrossPlayException("Cannot encode CrossPlayObject of type " + type + " as a literal.");
        }

        return json;
    }

    public static CrossPlayLiteral fromJson(JSONObject json) {
        CrossPlayObjectType type = CrossPlayObjectType.values[json.getInt("type")];
        
        switch (type) {
            case NULL:
                return new CrossPlayLiteral(type, null);
            case BOOLEAN:
                return new CrossPlayLiteral(type, json.getBoolean("value"));
            case INTEGER:
                return new CrossPlayLiteral(type, json.getInt("value"));
            case DOUBLE:
                return new CrossPlayLiteral(type, json.getDouble("value"));
            case STRING:
                return new CrossPlayLiteral(type, json.getString("value"));
            case ARRAY:
                JSONArray jsonArr = json.getJSONArray("value");
                CrossPlayObject[] arr = new CrossPlayObject[jsonArr.length()];

                for (int i = 0; i < jsonArr.length(); i++) {
                    arr[i] = CrossPlayObject.fromJson(jsonArr.getJSONObject(i));
                }

                return new CrossPlayLiteral(type, arr);
            case TEAM:
                int ordinal = json.getInt("value");
                return new CrossPlayLiteral(type, Team.values[ordinal]);
            default:
                throw new CrossPlayException("Cannot decode CrossPlayObject of type " + type + " as a literal.");
        }
    }
}
