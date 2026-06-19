#!/bin/bash

# CONSTANTS ----------------------------------------------------------------
STATE_DIR=".git/goofup-state"
STATE_FILE="$STATE_DIR/state" # Contains:
                              # 0) Current working branch name
                              # 1) Temp branch name
                              # 2) Ref to fix

## HELPER FUNCTION ----------------------------------------------------------
function abort_goofup {
  # Abort any current goofup session
  load_state

  # 1) If a rebase is in progress, abort it
  if rebase_in_progress
  then
    log_info "Aborting current git rebase..."
    git rebase --abort
  fi

  # 2) Switch back to original branch
  log_info "Switching back to original branch '$STATE_CURRENT_BRANCH..."
  if ! git checkout "$STATE_CURRENT_BRANCH"
  then
    log_error "Failed to checkout original branch. Fix issues from git then try again."
    exit 1
  fi

  # 3) Delete temp branch
  log_info "Deleting temporary branch '$STATE_TEMP_BRANCH'..."
  if ! git branch -D "$STATE_TEMP_BRANCH"
  then
    log_warning "Failed to delete temporary branch '$STATE_TEMP_BRANCH'. Clean up manually if desired."
  fi

  # 4) Cleanup the state
  cleanup_state
  log_success "Goofup aborted"
}

function auto_goofup {
  local ref_to_fix="$1"

  # 0) Validate there are local changes worth stashing
  if git diff --quiet && git diff --cached --quiet
  then
    log_error "--auto requires uncommitted changes to stash and apply, but the working tree is clean."
    exit 1
  fi

  # 1) Stash current changes
  log_info "Stashing current changes..."
  if ! git stash
  then
    log_error "Failed to stash changes"
    exit 1
  fi

  # 2) Start goofup (create temp branch, save state)
  start_goofup "$ref_to_fix"

  #3) Pop the stash
  log_info "Popping stash onto temp branch..."
  if ! git stash pop
  then
    log_error "Stash pop failed. Check any error messages above. Aborting goofup..."
    abort_goofup
    exit 1
  fi

  # 4) Stage all changes
  log_info "Staging all changes..."
  if ! git add -u
  then
    log_error "Failed to stage changes. Aborting goofup."
    abort_goofup
    exit 1
  fi

  # 5) Amend the commit
  log_info "Amending commit at '$ref_to_fix'"
  if ! git commit --amend --no-edit
  then
    log_error "Failed to amend commit. Aborting goofup."
    abort_goofup
    exit 1
  fi

  # 6) Complete the goofup
  continue_goofup
}

function cleanup_state {
  if [[ -d "$STATE_DIR" ]]
  then
    rm -rf "$STATE_DIR"
    log_info "Cleaned up goofup state"
  fi
}

function continue_goofup {
  # 1) Load state from disk
  load_state

  # 2) Perform or continue rebase of branch onto temp branch
  if git_rebase_in_progress
  then
    # A rebase is in progress, continue it.
    log_info "Continuing rebase onto '$STATE_TEMP_BRANCH' for '$STATE_CURRENT_BRANCH'..."
    if ! git rebase --continue
    then
      log_warning "Conflicts still present. Resolve them and re-run: \`git-goofup --continue\`"
      exit 1
    fi
  else
    # No rebase in progress, kick off a rebase
    log_info "Rebasing '$STATE_CURRENT_BRANCH' onto '$STATE_TEMP_BRANCH' (excluding '$STATE_REF_TO_FIX')..."

    # 2.1) Check out the original branch
    log_info "Switching to original branch '$STATE_CURRENT_BRANCH'..."
    if ! git checkout "$STATE_CURRENT_BRANCH"
    then
      log_error "Failed to switch to original branch '$STATE_CURRENT_BRANCH'."
      exit 1
    fi

    # 2.2) Rebase original branch onto target branch
    if ! git rebase --onto "$STATE_TEMP_BRANCH" "$STATE_REF_TO_FIX" "$STATE_CURRENT_BRANCH"
    then
      log_warning "Rebase detected conflicts"
      log_info "Resolve conflicts and run: \`git-goofup --continue\`"
      exit 1
    fi
  fi

  log_info "Successfully rebased"

  # 3) Cleanup temp branch
  if ! git branch -D "$STATE_TEMP_BRANCH"
  then
    log_warning "Could not delete temp branch. '$STATE_TEMP_BRANCH'. Delete manually if desired."
  fi

  # 4) Cleanup state
  cleanup_state
  log_success "Goofup completed successfully!"
}

function git_rebase_in_progress {
  # Detect both merge and apply backends
  if [[ -d "$(git rev-parse --git-dir)/rebase-apply" || -d "$(git rev-parse --git-dir)/rebase-merge" ]]
  then
    return 0
  else
    return 1
  fi
}

function git_repo_root {
  git rev-parse --show-toplevel
}

function load_state() {
  local repo_root
  repo_root="$(git_repo_root)"

  local state_path
  state_path="$repo_root/$STATE_FILE"

  if [[ ! -f "$state_path" ]]
  then
    log_error "No goofup is in progress - state file is missing"
    exit 1
  fi

  mapfile -t STATE < "$state_path"
  STATE_CURRENT_BRANCH="${STATE[0]}"
  STATE_TEMP_BRANCH="${STATE[1]}"
  STATE_REF_TO_FIX="${STATE[2]}"
}

function log_error() {
  echo -e "\033[0;31m[ERROR]\033[0m $1";
}

function log_info {
  echo -e "\033[0;34m[INFO]\033[0m $1"
}

function log_success {
  echo -e "\033[0;32m[DONE]\033[0m $1"
}

function log_warning {
  echo -e "\033[0;33m[WARN]\033[0m $1"
}

function save_state {
  local original_branch="$1"
  local temp_branch="$2"
  local ref_to_fix="$3"
  local repo_root="$(git_repo_root)"

  mkdir -p "$repo_root/$STATE_DIR"
  cat > "$repo_root/$STATE_FILE" << EOF
${original_branch}
${temp_branch}
${ref_to_fix}
EOF
}

function show_usage {
    cat <<EOF
Usage: git-goofup [OPTIONS]

Start a goofup session at a specific ref:
    git-goofup --at <ref_to_fix>

    - Creates a temp branch at <ref_to_fix> and switches to it
    - Make your edits:
      + Use \`git commit --amend\` to correct the existing commit and/or
      + Use \`git commit\` to add additional commits
    - When ready, \`run git-goofup --continue\`

Continue after making corrections
    git-goofup --continue

Abort and clean up:
    git-goofup --abort

Show this help message
    git-goofup --help
    git-goofup -h
EOF
}

function start_goofup {
  local ref_to_fix
  ref_to_fix="$1"

  # 0) Validations
  # 0.1) Validate ref
  if ! git rev-parse --verify "$ref_to_fix" >/dev/null
  then
    log_error "Ref to fix '$ref_to_fix' does not exist"
    exit 1
  fi

  # 0.2) Require a clean state
  if ! git diff --quiet || ! git diff --cached --quiet
  then
    log_warning "You have unstaged and/or staged changes. Consider committing or stashing before starting."
  fi

  # 1) Get the current branch
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"

  if [[ -z "$current_branch" ]]
  then
    log_error "Unable to determine current branch."
    exit 1
  fi

  # 2) Create the temporary branch at the ref that needs fixing
  local temp_branch
  temp_branch="$current_branch-temp$(date +%Y%m%d-%H%M%S)"

  log_info "Creating temp branch '$temp_branch' at '$ref_to_fix' and switching to it..."

  if ! git checkout -b "$temp_branch" "$ref_to_fix"
  then
    log_error "Failed to create/switch to temp branch '$temp_branch'"
    exit 1
  fi

  # 3) Save state and inform on how to continue
  save_state "$current_branch" "$temp_branch" "$ref_to_fix"

  cat << EOF
----------------------------------------------------------------------------
You're now on the temp branch: $temp_branch
Make your changes:
    - Make your edits:
      + Use \`git commit --amend\` to correct the existing commit and/or
      + Use \`git commit\` to add additional commits
    - When ready, run \`git-goofup --continue\`
    - To abandon, run \`git-goofup --abort\`
----------------------------------------------------------------------------
EOF
}

# MAIN FUNCTION ------------------------------------------------------------

function main {
  # Make sure we're in a git repository
  if ! git rev-parse --git-dir >/dev/null 2>&1
  then
    log_error "Not in a git repository!"
    exit 1
  fi

  local repo_root=$(git_repo_root)

  # Check arguments to see what mode to run in
  case "${1:-}" in
    --help|-h)
      show_usage
      ;;

    --abort)
      if [[ ! -d "$repo_root/$STATE_DIR" ]]
      then
        log_error "No goofup in progress"
        exit 1
      fi

      abort_goofup
      ;;

    --continue)
      if [[ ! -d "$repo_root/$STATE_DIR" ]]
      then
        log_error "No goofup in progress"
        exit 1
      fi

      continue_goofup
      ;;

    --at)
      if [[ $# -ne 2 ]]
      then
        log_error "Invalid arguments for --at"
        show_usage
        exit 1
      fi

      if [[ -d "$repo_root/$STATE_DIR" ]]
      then
        log_error "A goofup is already in progress. Use --continue or --abort."
        exit 1
      fi

      start_goofup "$2"
      ;;

    --auto)
      if [[ $# -ne 2 ]]
      then
        log_error "Invalid arguments for --auto"
        show_usage
        exit 1
      fi

      if [[ -d "$repo_root/$STATE_DIR" ]]
      then
        log_error "A goofup is already in progress. Use --continue or --abort."
        exit 1
      fi

      auto_goofup "$2"
      ;;

    "")
      log_error "No arguments provided"
      show_usage
      exit 1
      ;;

    *)
      log_error "Unknown option: $1"
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
