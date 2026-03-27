const PLAYBACK_LIBRARY = [
    {
        id: "featured_intro",
        title: "Planck Ponder",
        badge: "Title Screen",
        summary: "Intro and main screen loop for the experience.",
        clips: [
            {
                id: "plank_ponder",
                label: "Main screen intro",
                src: "./media/Planck Ponder.mp4",
                type: "video/mp4",
                note: "Use this as the title or landing-state video while players settle in."
            }
        ]
    },
    {
        id: "turn_state",
        title: "Player Turn",
        badge: "Turn State",
        summary: "Active turn animation for when the player is walking toward the plank.",
        clips: [
            {
                id: "pythenian_turn_walk",
                label: "Walking toward plank",
                src: "./media/Pythenian Walking Toward Plank.mp4",
                type: "video/mp4",
                note: "Best fit for the live turn state when the player's move resolves."
            }
        ]
    },
    {
        id: "loser_state",
        title: "Losing Sequence",
        badge: "Loss State",
        summary: "Defeat-side animations for the player who falls short.",
        clips: [
            {
                id: "plank_pointing",
                label: "Plank pointing",
                src: "./media/Planck Pointing to Plank.mp4",
                type: "video/mp4",
                note: "A good pre-impact loss beat if you want a staged defeat sequence."
            },
            {
                id: "shark_chomp",
                label: "Shark chomp finale",
                src: "./media/Chop Shark Bite Finale.mp4",
                type: "video/mp4",
                note: "Works well as the decisive loss animation or final sting."
            }
        ]
    },
    {
        id: "winner_state",
        title: "Winner Reveal",
        badge: "Win State",
        summary: "Victory-side animation for the surviving player.",
        clips: [
            {
                id: "derp_winner",
                label: "Winner animation",
                src: "./media/Derp Winner Animation.mp4",
                type: "video/mp4",
                note: "Use this for the winner's end-state celebration."
            }
        ]
    }
];

const PLAYBACK_ENTRY_IDS = {
    intro: "featured_intro",
    turn: "turn_state",
    loser: "loser_state",
    winner: "winner_state"
};

function getPlaybackMatches() {
    return PLAYBACK_LIBRARY.filter((entry) =>
        entry &&
        Array.isArray(entry.clips) &&
        entry.clips.length > 0
    );
}

function getPlaybackMatchById(matchId) {
    return getPlaybackMatches().find((entry) =>
        String(entry.id ?? entry.matchId ?? "") === String(matchId)
    ) ?? null;
}

export {
    PLAYBACK_ENTRY_IDS,
    getPlaybackMatchById,
    getPlaybackMatches
};
