package battlecode.world;

import battlecode.common.GameConstants;
import battlecode.common.MapLocation;
import battlecode.common.Team;
import java.util.*;
import static battlecode.common.GameActionExceptionType.*;

/**
 * This class is used to hold information regarding team specific values such as
 * team names.
 */
public class TeamInfo {

    private GameWorld gameWorld;
    private int[] globalCheese;
    private int[] dirtCounts;
    private int[] oldCheeseCounts;
    private int[] totalNumRats;
    private int[] points;

    /**
     * Create a new representation of TeamInfo
     *
     * @param gameWorld the gameWorld the teams exist in
     */
    public TeamInfo(GameWorld gameWorld) {
        this.gameWorld = gameWorld;
        this.globalCheese = new int[2];
        this.dirtCounts = new int[2];
        this.oldCheeseCounts = new int[2];
        this.totalNumRats = new int[2];
        this.points = new int[2];
    }

    // *********************************
    // ***** GETTER METHODS ************
    // *********************************
  
    /**
     * Get the amount of cheese.
     * 
     * @param team the team to query
     * @return the team's cheese count
     */

    public int getCheese(Team team) {
        return this.globalCheese[team.ordinal()];
    }

    /**
     * Get the amount of dirt.
     * 
     * @param team the team to query
     * @return the team's dirt count
     */
    public int getDirt(Team team) {
        return this.dirtCounts[team.ordinal()];
    }

     /**
     * Get the total number of rats belonging to a team
     * @param team the team to query
     * @return the number of rats the team has
     */
    public int getNumRats(Team team){
        return this.totalNumRats[team.ordinal()];
    }

    /**
     * Get the amount of points belonging to a team
     * @param team the team to query
     * @return the number of points the team has
     */
    public int getPoints(Team team){
        return this.points[team.ordinal()];
    }

    /**
     * Change the total number of rats belonging to a team
     * @param team the team to change
     */
    public void addRats(int num, Team team){
        this.totalNumRats[team.ordinal()] += num;
    }

    // *********************************
    // ***** UPDATE METHODS ************
    // *********************************

    /**
     * Add to the amount of cheese. If amount is negative, subtract from cheese
     * instead.
     * 
     * @param team   the team to query
     * @param amount the change in the cheese count
     * @throws IllegalArgumentException if the resulting amount of cheese is negative
     */
    public void addCheese(Team team, int amount) throws IllegalArgumentException {
        if (this.globalCheese[team.ordinal()] + amount < 0) {
            throw new IllegalArgumentException("Invalid cheese change");
        }
        this.globalCheese[team.ordinal()] += amount;
    }

    /**
     * Get the amount of points.
     * 
     * @param team the team to query
     * @param amount the change in the amount of points
     */
    public int addPoints(Team team, int amount) {
        this.points[team.ordinal()] += amounts;
    }

    /**
     * Update the amount of dirt. 
     * 
     * @param team   the team to query
     * @param isPlace whether dirt is being placed (true) or removed (false)
     */
    public void updateDirt(Team team, boolean isPlace) {
        if (isPlace) {
            this.dirtCounts[team.ordinal()] -= 1;
        } else {
            this.dirtCounts[team.ordinal()] += 1;
        }
    }

    private void checkWin(Team team) {
        if (true) { // TODO: replace with a condition for winning (e.g. all rat kings dead)
            throw new InternalError("Reporting incorrect win");
        }
        this.gameWorld.gameStats.setWinner(team);
        this.gameWorld.gameStats.setDominationFactor(DominationFactor.PAINT_ENOUGH_AREA);
    }

    public int getRoundCheeseChange(Team team) {
        return this.globalCheese[team.ordinal()] - this.oldCheeseCounts[team.ordinal()];
    }

    public void processEndOfRound() {
        this.oldCheeseCounts[0] = this.globalCheese[0];
        this.oldCheeseCounts[1] = this.globalCheese[1];
    }

}
