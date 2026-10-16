export const BOARD_MEETING_IMAGE = '/Events/Board/board-meeting.jpeg'
export const BOARD_ELECTION_IMAGE = '/Events/Board/special-borad-meeting.jpeg'

export const getBoardMeetingImageUrl = (isJanuary) => (
  isJanuary ? BOARD_ELECTION_IMAGE : BOARD_MEETING_IMAGE
)
