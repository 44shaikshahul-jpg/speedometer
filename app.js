// =====================================
// PULSAR 150 DIGITAL SPEEDOMETER
// =====================================

let watchId = null;

let currentSpeed = 0;
let travelledDistance = 0;
let maxSpeed = 0;

let previousPosition = null;
let lastSaveTime = 0;
let saving = false;

// HTML elements
const speedDisplay = document.getElementById("speed");
const distanceDisplay = document.getElementById("distance");

const totalDistanceDisplay =
    document.getElementById("total-distance");

const maxSpeedDisplay =
    document.getElementById("max-speed");

const accuracyDisplay =
    document.getElementById("accuracy");

const message = document.getElementById("message");
const saveStatus = document.getElementById("save-status");

const startButton = document.getElementById("start-btn");
const resetButton = document.getElementById("reset-btn");

const progressCircle =
    document.getElementById("distance-progress");

const circumference = 2 * Math.PI * 91;


// =====================================
// LOAD DATA FROM SUPABASE
// =====================================

async function loadTripData() {

    try {

        const { data: { session }, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        let activeSession = session;

        // Create anonymous user if not logged in
        if (!activeSession) {

            const { data, error } =
                await supabaseClient.auth.signInAnonymously();

            if (error) throw error;

            activeSession = data.session;
        }

        const userId = activeSession.user.id;

        // Get saved trip data
        const { data, error } = await supabaseClient
            .from("bike_trip_state")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) throw error;

        if (data) {

            travelledDistance =
                Number(data.distance_km) || 0;

            maxSpeed =
                Number(data.max_speed) || 0;

        }

        updateDashboard();

        saveStatus.textContent = "Cloud: Connected ✓";

    } catch (error) {

        console.error(error);

        saveStatus.textContent =
            "Cloud: Connection failed";

    }

}


// =====================================
// UPDATE SPEEDOMETER DISPLAY
// =====================================

function updateDashboard() {

    speedDisplay.textContent =
        Math.round(currentSpeed);

    distanceDisplay.textContent =
        travelledDistance.toFixed(2);

    totalDistanceDisplay.textContent =
        travelledDistance.toFixed(2);

    maxSpeedDisplay.textContent =
        Math.round(maxSpeed);

    const progress = Math.min(
        travelledDistance / 100,
        1
    );

    progressCircle.style.strokeDasharray =
        circumference;

    progressCircle.style.strokeDashoffset =
        circumference * (1 - progress);

}


// =====================================
// DISTANCE CALCULATION
// HAVERSINE FORMULA
// =====================================

function calculateDistance(lat1, lon1, lat2, lon2) {

    const earthRadius = 6371;

    const toRadians = degrees =>
        degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;

}


// =====================================
// GPS POSITION UPDATE
// =====================================

function gpsSuccess(position) {

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    const accuracy = position.coords.accuracy;

    accuracyDisplay.textContent =
        Math.round(accuracy);

    if (accuracy > 30) {

        message.textContent =
            "GPS accuracy is low. Waiting for a better signal.";

        return;
    }

    const currentPoint = {
        latitude,
        longitude,
        time: position.timestamp,
        accuracy
    };

    let calculatedSpeed = null;

    // Calculate distance between GPS points
    if (previousPosition) {

        const distance = calculateDistance(
            previousPosition.latitude,
            previousPosition.longitude,
            latitude,
            longitude
        );

        const timeDifference =
            (currentPoint.time - previousPosition.time) / 1000;

        // Ignore GPS jumps and invalid intervals
        if (
            timeDifference > 0.5 &&
            timeDifference <= 10 &&
            distance >= 0.003 &&
            distance <= 0.15
        ) {

            travelledDistance += distance;

            calculatedSpeed =
                (distance / timeDifference) * 3600;

        }

    }

    previousPosition = currentPoint;

    // Prefer GPS-reported speed
    let gpsSpeed = position.coords.speed;

    if (
        gpsSpeed !== null &&
        Number.isFinite(gpsSpeed) &&
        gpsSpeed >= 0
    ) {

        currentSpeed = gpsSpeed * 3.6;

    } else if (calculatedSpeed !== null) {

        currentSpeed = calculatedSpeed;

    } else {

        currentSpeed = 0;

    }

    // Ignore implausible readings
    if (currentSpeed > 220) {
        currentSpeed = 0;
    }

    // Maximum speed
    if (currentSpeed > maxSpeed) {
        maxSpeed = currentSpeed;
    }

    updateDashboard();

    message.textContent =
        "GPS Connected. Ride safely!";

    // Save every 5 seconds
    saveTripData(false);

}


// =====================================
// GPS ERROR HANDLING
// =====================================

function gpsError(error) {

    console.error(error);

    switch (error.code) {

        case 1:
            message.textContent =
                "Location permission denied.";
            break;

        case 2:
            message.textContent =
                "GPS location unavailable.";
            break;

        case 3:
            message.textContent =
                "GPS timeout. Waiting for signal.";
            break;

        default:
            message.textContent =
                "GPS error occurred.";
    }

}


// =====================================
// START GPS
// =====================================

function startGPS() {

    if (!navigator.geolocation) {

        message.textContent =
            "Your browser does not support GPS.";

        return;
    }

    if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
    ) {

        message.textContent =
            "GPS requires HTTPS or localhost.";

        return;
    }

    if (watchId !== null) return;

    previousPosition = null;

    watchId = navigator.geolocation.watchPosition(
        gpsSuccess,
        gpsError,
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 15000
        }
    );

    startButton.disabled = true;
    startButton.textContent = "GPS RUNNING";

    message.textContent =
        "Waiting for GPS signal...";
}


// =====================================
// SAVE DATA TO SUPABASE
// =====================================

async function saveTripData(force = false) {

    if (saving) return;

    if (!force && Date.now() - lastSaveTime < 5000) {
        return;
    }

    saving = true;

    try {

        const { data: { session }, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session) throw new Error("No authenticated session");

        const userId = session.user.id;

        const tripData = {

            user_id: userId,

            distance_km:
                Number(travelledDistance.toFixed(4)),

            max_speed:
                Number(maxSpeed.toFixed(2)),

            updated_at: new Date().toISOString()

        };

        const { error } = await supabaseClient
            .from("bike_trip_state")
            .upsert(tripData, {
                onConflict: "user_id"
            });

        if (error) throw error;

        lastSaveTime = Date.now();

        saveStatus.textContent =
            "Cloud: Data saved ✓";

    } catch (error) {

        console.error(error);

        saveStatus.textContent =
            "Cloud: Save failed";

    } finally {

        saving = false;

    }

}


// =====================================
// RESET TRIP DATA
// =====================================

async function resetTrip() {

    const confirmation = confirm(
        "Are you sure you want to reset travelled distance?"
    );

    if (!confirmation) return;

    // Reset local values
    travelledDistance = 0;
    currentSpeed = 0;
    maxSpeed = 0;

    previousPosition = null;

    updateDashboard();

    message.textContent =
        "Trip data reset successfully.";

    // Immediately save zero values
    saveStatus.textContent =
        "Cloud: Updating reset...";

    await saveTripData(true);

}


// =====================================
// BUTTON EVENTS
// =====================================

startButton.addEventListener(
    "click",
    startGPS
);

resetButton.addEventListener(
    "click",
    resetTrip
);


// =====================================
// INITIALIZE APPLICATION
// =====================================

progressCircle.style.strokeDasharray =
    circumference;

progressCircle.style.strokeDashoffset =
    circumference;

updateDashboard();

loadTripData();


// Stop GPS when leaving page
window.addEventListener("beforeunload", () => {

    if (watchId !== null) {

        navigator.geolocation.clearWatch(watchId);

    }

});