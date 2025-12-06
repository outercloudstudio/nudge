package battlecode.world;

/**
 * Determines roughly by how much the winning team won.
 */
public enum DominationFactor {
    // TODO: update with new win conditions
    /**
     * Win by killing all opponent rat kings.
     */
    KILL_ALL_RAT_KINGS,
    /**
     * Win by having more cheese at the end of the game.
     */
    MORE_CHEESE,
    /**
     * Win by having more robots alive (tiebreak 5).
     */
    MORE_ROBOTS_ALIVE, 
    /**
     * Win by coinflip (tiebreak 6).
     */
    WON_BY_DUBIOUS_REASONS,
    /**
     * Win because the other team resigns.
     */
    RESIGNATION;
}
