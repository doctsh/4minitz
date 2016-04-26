/**
 * Created by wok on 16.04.16.
 */

import { Meteor } from 'meteor/meteor';
import { MeetingSeriesCollection } from './collections/meetingseries_private';
import { Minutes } from './minutes'

export class MeetingSeries {
    constructor(source) {   // constructs obj from Mongo ID or Mongo document
        if (! source)
            return;

        if (typeof source === 'string') {   // we may have an ID here.
            source = MeetingSeriesCollection.findOne(source);
        }
        if (typeof source === 'object') { // inject class methods in plain collection document
            _.extend(this, source);
        }
    }

    // ################### static methods
    static find() {
        return MeetingSeriesCollection.find.apply(MeetingSeriesCollection, arguments);
    }

    static findOne() {
        return MeetingSeriesCollection.findOne.apply(MeetingSeriesCollection, arguments);
    }

    static remove(meetingSeries) {
        if (meetingSeries.countMinutes() > 0) {
            Meteor.call(
                "minutes.remove",
                meetingSeries.getAllMinutes().map(
                    (minutes) => {
                        return minutes._id
                    })
            );
        }
        Meteor.call("meetingseries.remove", meetingSeries._id);
    }


    // ################### object methods

    removeMinutesWithId(minutesId) {
        // when removing minutes, remove the id from the minutes array in the
        // this meetingSeries as well.
        Meteor.call('meetingseries.removeMinutesFromArray', this._id, minutesId);

        // then we remove the minutes itself.
        Minutes.remove(minutesId);

        // last but not least we update the lastMinutesDate-field
        this.updateLastMinutesDate();
    }

    save () {
        if (this._id && this._id != "") {
            console.log("My Minutes:"+this.minutes);
            Meteor.call("meetingseries.update", this);
        } else {
            Meteor.call("meetingseries.insert", this);
        }
    }

    toString () {
        return "MeetingSeries: "+JSON.stringify(this, null, 4);
    }

    log () {
        console.log(this.toString());
    }

    addNewMinutes (optimisticUICallback, serverCallback) {
        console.log("addNewMinutes()");

        // The new Minutes object should be dated after the latest existing one
        let newMinutesDate = new Date();
        let lastMinutes = this.lastMinutes();
        if (lastMinutes && formatDateISO8601(newMinutesDate) <= lastMinutes.date) {
            let lastMinDate = new Date(lastMinutes.date);
            newMinutesDate.setDate(lastMinDate.getDate() + 1);
        }

        let min = new Minutes({
            meetingSeries_id: this._id,
            date: formatDateISO8601(newMinutesDate)
        });

        min.save(optimisticUICallback, serverCallback);
    }

    getAllMinutes () {
        return Minutes.findAllIn(this.minutes);
    }

    countMinutes () {
        if (this.minutes) {
            return this.minutes.length;
        } else {
            return 0;
        }
    }

    lastMinutes () {
        if (!this.minutes || this.minutes.length == 0) {
            return false;
        }
        let lastMin = Minutes.findAllIn(this.minutes, 1).fetch();
        if (lastMin && lastMin.length == 1) {
            return lastMin[0];
        }
        return false;
    }

    updateLastMinutesDate () {
        let lastMinutesDate;

        let lastMinutes = this.lastMinutes();
        if (lastMinutes) {
            lastMinutesDate = lastMinutes.date;
        }

        if (!lastMinutesDate) {
            return;
        }

        Meteor.call(
            'meetingseries.update', {
                _id: this._id,
                lastMinutesDate: lastMinutesDate
            },
            // server callback
            // TODO: display error / this callback should be provided by the caller of this function
            (error) => {
                if (error) {
                    console.log(error); // for the moment we log this error so we can notice if any error occurs.
                }
            }
        );
    }

    /**
     * Finalizes the given minutes and
     * copies the open/closed topics to
     * this series.
     *
     * @param minutes
     */
    finalizeMinutes (minutes) {
        this.relatedActionItems = minutes.topics;
        this.save();
        minutes.finalize();
    }

    addNewMinutesAllowed() {
        let lastMinutes = this.lastMinutes();
        return (!lastMinutes || lastMinutes.isFinalized);
    }
}
