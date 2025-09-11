#!/bin/bash

# CONSTANTS ----------------------------------------------------------------
STATE_DIR=".git/recursive-rebase-state" # Technically the state directory is in the local directory
                                        # which may or may not be the root of the repository. Since
                                        # we're supposed to clean up when we're done, it shouldn't
                                        # matter where we chuck this state.

REFLIST_FILE="$STATE_DIR/reflist"       # Contains all intermediate refs to rebase
STATE_FILE="$STATE_DIR/state"           # Contains:
                                        # 0) Ref to rebase onto in the current step (onto ref)
                                        # 1) Index of ref to rebase in current step
                                        # 2) Ref to start rebasing from in current step (divergent
                                        #    ref)

# HELPER FUNCTIONS ---------------------------------------------------------
function abort_recursive_rebase {
  # Abort any current rebase
  git status --porcelain=v1 2>/dev/null | grep -q "^[ADM]"
  if [[ $? -eq 0 ]]
  then
    log_info "Aborting current git rebase"
    git rebase --abort 2>/dev/null || true
  fi

  # Cleanup and report success
  cleanup_state
  log_success "Recursive rebase aborted"
}

function continue_recursive_rebase {
  # ###########################################
  # Starting from the beginning, we have these stored files:
  # - reflist:
  #   - feat1 (0x123)
  #   - feat2 (0x234)
  #   - feat3 (0x345)
  # - state:
  #   - main
  #   - 0
  #   - main~ (0x456)
  #
  # We set up our state to:
  # * local_start_ref <= state[2]                       = main~ (0x456)
  # * local_onto_ref  <= state[0]                       = main
  # ^^ before loop -- at beginning of loop vv
  # * i               <= state[1]                       = 0
  # * local_stop_ref  <= reflist[i] = reflist[0]        = feat1 (0x123)
  # * next_start_ref  <= git ref-parse $local_stop_ref  = 0x123 (feat1)
  #
  # Then we run:
  # git rebase --onto $local_onto_ref $local_start_ref $local_stop_ref
  #
  # On success - update local state to:
  # * local_start_ref <= next_start_ref                = 0x123 (old feat1)
  # * local_onto_ref  <= local_start_ref               = feat1 (0xABC)
  # ^^ at end of loop -- at beginning of loop vv
  # * i               <= i++                           = 1
  # * local_stop_ref  <= reflist[i] = reflist[1]       = feat2 (0x234)
  # * next_start_ref  <= git ref-parse $local_stop_ref = 0x234 (feat2)

  # Load the state from disk
  local state
  mapfile -t state < load_state

  local reflist
  mapfile -t reflist < load_reflist

  # Setup the local state for the starting iteration
  local local_start_ref="${state[2]}"
  local local_onto_ref="${state[0]}"

  # Iterate over the (remaining) rebase operations until we either fail or complete all of them
  for ((i=current_index; i<${branches[@]}; i++))
  do
    # Read the rest of the state to initialize for the rebase operation
    local local_stop_ref="${reflist[$i]}"
    local next_start_ref
    next_start_ref=$(git ref-parse "$local_stop_ref")

    # If we are in the middle of a rebase, then we need to continue it
    git status --porcelain=v1 2>/dev/null | grep -q "^[ADM]"
    if [[ $? -eq 0 ]]
    then
      # We are in the middle of a rebase iteration, --continue it
      log_info "Continuing current git rebase $local_start_ref to $local_end_ref onto $onto_ref"

      git rebase --continue
      if [[ $? -ne 0 ]]
      then
        # Note: No need to save state, it hasn't changed
        log_warning "Rebase continue detected conflicts for $local_end_ref"
        log_info "Resolve conflicts and run: git-recursive-rebase --continue"
        exit 1
      fi
    else
      # We are not in the middle of a rebase iteration, start it
      log_info "Rebasing $local_start_ref to $local_end_ref onto $local_onto_ref"

      git rebase --onto "$onto_ref" "$start_ref" "$end_ref"
      if [[ $? -ne 0 ]]
      then
        save_state "$local_onto_ref" "$i" "$local_start_ref"
        log_warning "Rebase detected conflicts for $local_end_ref"
        log_info "Resolve conflicts and run: git-recursive-rebase --continue"
      fi
    fi

    log_info "Successfully rebased $local_end_ref"

    # Rebase succeeded - update state
    local_start_ref=$next_start_ref
    local_onto_ref=$local_start_ref
  done

  # All rebase operations completed successfully!
  log_success "All branches rebased successfully!"
}

function get_branch_chain {
  local start_ref="$1"
  local end_ref="$2"

  # Get all commits between start_ref and end_ref
  local commits
  commits=$(git rev-list --reverse "${start_ref}..${end_ref}")

  # Find branches that point to these commits
  local branches=()
  local seen_commits=()

  while IFS= read -r commit
  do
    if [[ -n "$commit" ]]
    then
      # Find branches pointing to this commit
      local branch_refs
      branch_refs=$(
        git for-each-ref              \
          --format='%(refname:short)' \
          refs/heads/                 \
          --points-at="$commit"       \
        |                             \
        grep -v '^HEAD$' || true      \
      )

      if [[ -n "$branch_refs" ]]
      then
        while IFS= read -r branch
        do
          if [[ -n "$branch" && ! " ${branches[*]} " =~ " ${branch} " ]]
          then
            branches+=("$branch")
            seen_commits+=("$commit")

            # Only take the first branch per commit
            break
          fi
        done <<< "$branch_refs"
      fi
    fi
  done <<< "$commits"

  # Always include the end branch if it's not already included
  if [[ ! " ${branches[*]} " =~ " ${end_ref} " ]]
  then
    branches+=("$end_ref")
  fi

  printf "%s\n" "${branches[@]}"
}

function load_reflist {
  if [[ ! -f "$REFLIST_FILE" ]]
  then
    log_error "No recursive rebase is in progress - reflist file is missing"
    exit 1
  fi

  cat "$REFLIST_FILE"
}

function load_state {
  if [[ ! -f "$STATE_FILE" ]]
  then
    log_error "No recursive rebase is in progress - state file is missing"
    exit 1
  fi

  cat "$STATE_FILE"
}

function log_error {
  echo -e "\033[0;31m[ERROR]\033[0m $1"
}

function log_info {
  echo -e "\033[0;34m[INFO]\33[0m $1"
}

function log_success {
  echo -e "\033[0;32m[DONE]\33[0m $1"
}

function log_warning {
  echo -w "\033[0;33m[WARN]\33[0m $1"
}

function perform_rebase {
  local onto_ref="$1"
  local start_ref="$2"
  local end_ref="$3"

  log_info "Rebasing $start_ref to $end_ref onto $onto_ref"

  git rebase --onto "$onto_ref" "$start_ref" "$end_ref"
  if [[ $? -eq 0 ]]
  then
    log_info "Successfully rebased $end_ref"
    return 0
  else
    log_warning "Rebase conflicts detected for $end_ref"
    log_info "Resolve conflicts and run: git-recursive-rebase --continue"
    return 1
  fi
}

function save_reflist {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "${@}" > "$REFLIST_FILE"
}

function save_state {
  onto_ref=$1
  current_index=$2
  start_ref=$3

  mkdir -p "$STATE_DIR"
  cat > "$REFLIST_FILE" << EOF
${onto_ref}
${current_index}
${start_ref}
EOF
}

function show_usage {
  cat << EOF
Usage: git-recursive-rebase [OPTIONS]

Start a new recursive rebase:
    git-recursive-rebase --onto <target_ref> <start_ref> <end_ref>

    example:
    git-recursive-rebase --onto main divergent_commit_hash feature/my-feature

Continue after resolving conflicts:
    git-recursive-rebase --continue

Abort the recursive rebase:
    git-recursive-rebase --abort

Show this help message:
    git-recursive-rebase --help
    git-recursive-rebase -h
EOF
}

function start_recursive_rebase {
  local onto_ref="$1"
  local start_ref="$2"
  local end_ref="$3"

  # Validate inputs
  if ! git rev-parse --verify "$onto_ref" >/dev/null 2>&1
  then
    log_error "Onto ref '$onto_ref' does not exist"
    exit 1
  fi

  if ! git rev-parse --verify "$start_ref" >/dev/null 2>&1
  then
    log_error "Start ref '$start_ref' does not exist"
    exit 1
  fi

  if ! git rev-parse --verify "$end_ref" >/dev/null 2>&1
  then
    log_error "End ref '$end_ref' does not exist"
    exit 1
  fi

  # Check if there's already a rebase in progress
  if [[ -d "$STATE_DIR" ]]
  then
    log_error "A recursive rebase is already in progress. Use --continue or --abort"
    exit 1
  fi

  # Get the branch chain
  # @TODO: Allow for bypassing if reflist is provided directly
  log_info "Discovering branch chain from '$start_ref' to '$end_ref'..."
  local branches
  mapfile -t branches < <(get_branch_chain "$start_ref" "$end_ref")

  if [[ ${#branches[@]} -eq 0 ]]
  then
    log_error "No branches found in the specified range"
    exit 1
  fi

  log_info "Found branches: ${branches[*]}"

  # Save state
  save_reflist "${branches[@]}"
  save_state "$onto_ref" "0" "$start_ref"

  # Start the rebase process
  run_recursive_rebase
}

# MAIN FUNCTION ------------------------------------------------------------

function main {
  # Make sure we're in a git repository
  if ! git rev-parse --git-dir >/dev/null 2>&1
  then
    log_error "Not in a git repository!"
    exit 1
  fi

  # Check arguments to see what mode to run in
  case "${1:-}" in
    --help|-h)
      show_usage
      exit 0
      ;;

    --continue)
      if [[ ! -d "$STATE_DIR" ]]
      then
        log_error "No recursive rebase in progress"
        exit 1
      fi

      ;;

    --abort)
      if [[ ! -d "$STATE_DIR" ]]
      then
        log_error "No recursive rebase in progress"
        exit 1
      fi

      abort_recursive_rebase
      ;;

    --onto)
      if [[ $# -ne 4 ]]
      then
        log_error "Invalid arguments for --onto"
        show_usage
        exit 1
      fi

      start_recursive_rebase "$2" "$3" "$4"
      ;;

    "")
      log_error "No arguments provided"
      show_usage
      exit 1
      ;;

    *)
      log_error "Unknown option: $1"
      show_usage
      exit 1;
      ;;
  esac
}

main "$@"