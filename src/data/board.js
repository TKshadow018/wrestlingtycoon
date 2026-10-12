import boardMembers from './people/board.json'

export const BOARD_MEMBERS = boardMembers

const getRequiredBoardMember = (role) => {
  const member = BOARD_MEMBERS.find((entry) => entry.current_role === role)
  if (!member) {
    throw new Error(`Board data is missing the required ${role} member`)
  }

  return member
}

if (BOARD_MEMBERS.length !== 7) {
  throw new Error(`Expected 7 board members, received ${BOARD_MEMBERS.length}`)
}

export const BOARD_CHAIR = getRequiredBoardMember('Board Chair')
export const BOARD_VICE_CHAIR = getRequiredBoardMember('Vice Chair')
export const OTHER_BOARD_MEMBERS = BOARD_MEMBERS.filter(
  (member) => member !== BOARD_CHAIR && member !== BOARD_VICE_CHAIR,
)
