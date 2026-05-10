import os
import re
import subprocess
import threading
import time
from pathlib import Path

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler


REPO_DIR = Path.home() / "workspace" / "k8s-monitor"
SESSION_NAME = "codex-slack-job"
LOGS_DIR = REPO_DIR / ".agent" / "logs"
CONTEXT_DIR = REPO_DIR / ".agent" / "slack-context"
MAX_CONTEXT_CHARS = 12000
MAX_SLACK_CHARS = 3500
CORE_DOCS = [
    "AGENTS.md",
    "docs/PRODUCT_SPEC.md",
    "docs/ARCHITECTURE.md",
    "docs/API_CONTRACT.md",
    "TASKS.md",
]

app = App(token=os.environ["SLACK_BOT_TOKEN"])
active_jobs = {}
active_jobs_lock = threading.Lock()


def run_shell(command: str, timeout: int = 30) -> str:
    result = subprocess.run(
        command,
        cwd=REPO_DIR,
        shell=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
    )
    output = result.stdout.strip()
    return output[-3500:] if output else "(no output)"


def safe_thread_id(channel: str, thread_ts: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", f"{channel}-{thread_ts}")


def context_path(channel: str, thread_ts: str) -> Path:
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)
    return CONTEXT_DIR / f"{safe_thread_id(channel, thread_ts)}.md"


def append_context(channel: str, thread_ts: str, role: str, content: str) -> None:
    path = context_path(channel, thread_ts)
    with path.open("a", encoding="utf-8") as file:
        file.write(f"\n\n## {role}\n\n{content.strip()}\n")


def read_context(channel: str, thread_ts: str) -> str:
    path = context_path(channel, thread_ts)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")[-MAX_CONTEXT_CHARS:]


def read_core_docs() -> str:
    sections = []
    for relative_path in CORE_DOCS:
        path = REPO_DIR / relative_path
        if path.exists():
            sections.append(f"## {relative_path}\n\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(sections)


def read_issue(issue_number: str) -> str:
    return run_shell(f"gh issue view {issue_number}", timeout=20)


def referenced_issue_numbers(text: str) -> list[str]:
    return list(
        dict.fromkeys(
            re.findall(r"(?:#|issue\s+|이슈\s*)(\d+)", text, flags=re.IGNORECASE)
        )
    )


def read_referenced_issues(text: str) -> str:
    sections = []
    for issue_number in referenced_issue_numbers(text):
        sections.append(f"## GitHub Issue #{issue_number}\n\n{read_issue(issue_number)}")
    return "\n\n".join(sections)


def reset_context(channel: str, thread_ts: str) -> None:
    path = context_path(channel, thread_ts)
    if path.exists():
        path.unlink()


def slack_excerpt(output: str) -> str:
    output = output.strip()
    return output[-MAX_SLACK_CHARS:] if output else "(AI output 없음)"


def post_thread_message(channel: str, thread_ts: str, text: str) -> None:
    app.client.chat_postMessage(channel=channel, thread_ts=thread_ts, text=text)


def run_codex_and_reply(prompt: str, channel: str, thread_ts: str) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    job_id = safe_thread_id(channel, thread_ts)
    log_path = LOGS_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{job_id}-codex.log"

    process = subprocess.Popen(
        [
            "codex",
            "exec",
            "-s",
            "danger-full-access",
            "--dangerously-bypass-approvals-and-sandbox",
            prompt,
        ],
        cwd=REPO_DIR,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    with active_jobs_lock:
        active_jobs[thread_ts] = process

    try:
        output, _ = process.communicate(timeout=60 * 60 * 2)
    except subprocess.TimeoutExpired:
        process.kill()
        output, _ = process.communicate()
        output = f"{output or ''}\n\nAI 작업이 2시간 제한을 넘어 중단됐습니다."
    finally:
        with active_jobs_lock:
            active_jobs.pop(thread_ts, None)

    log_path.write_text(output or "", encoding="utf-8")
    append_context(channel, thread_ts, "Codex", output or "")

    status = "완료" if process.returncode == 0 else f"종료 코드 {process.returncode}"
    post_thread_message(
        channel,
        thread_ts,
        f"AI 작업 {status}.\n로그: `{log_path.relative_to(REPO_DIR)}`\n```{slack_excerpt(output or '')}```",
    )


def start_codex_job(prompt: str, channel: str, thread_ts: str) -> str:
    with active_jobs_lock:
        if thread_ts in active_jobs:
            return "이 Slack 스레드에서 이미 AI 작업이 실행 중입니다. 완료 후 다시 말하거나 `stop`으로 중단하세요."
        active_jobs[thread_ts] = None

    thread = threading.Thread(
        target=run_codex_and_reply,
        args=(prompt, channel, thread_ts),
        daemon=True,
    )
    thread.start()
    return "AI 작업을 시작했습니다. 완료되면 이 스레드에 결과를 남기겠습니다."


def build_codex_prompt(
    user_prompt: str,
    channel: str,
    thread_ts: str,
) -> str:
    previous_context = read_context(channel, thread_ts)
    core_docs = read_core_docs()
    issue_context = read_referenced_issues(user_prompt)
    issue_section = f"\n\n참조된 GitHub Issue:\n{issue_context}\n" if issue_context else ""

    return f"""
사용자가 Slack에서 AI에게 요청했다.

이번 사용자 입력:
{user_prompt}

핵심 프로젝트 문서:
{core_docs}
{issue_section}

이 Slack 스레드의 이전 컨텍스트:
{previous_context or "(이전 컨텍스트 없음)"}

작업 규칙:
- 사용자의 입력이 질문, 분석, 추천 요청이면 파일을 수정하지 말고 같은 Slack thread에 답할 최종 답변만 작성해라.
- 사용자의 입력이 구현, 수정, 문서화, issue 처리, 실행 요청이면 실제 작업을 수행해라.
- GitHub Issue 번호가 언급되면 해당 issue 본문과 acceptance criteria를 작업 범위로 삼아라.
- 작업 범위를 넘기지 마라.
- 구현으로 요구사항, API, 아키텍처, 실행 방법이 바뀌면 관련 문서를 현재 기준으로 수정해라.
- secret 값, Slack webhook URL, GitHub token, kubeconfig 내용은 출력하거나 파일에 저장하거나 커밋하지 마라.
- 운영 Kubernetes 클러스터에 변경을 적용하는 kubectl apply/delete/scale/rollout 작업은 하지 마라.
- 구현 방향 확인이 필요해서 더 진행하면 위험하면, 작업을 멈추고 `USER_INPUT_REQUIRED` 제목 아래에 사용자가 답해야 할 질문만 명확히 적어라.
- 사용자가 이전 `USER_INPUT_REQUIRED`에 답했다면, 그 답을 반영해서 이어서 작업해라.
- 파일을 수정했다면 관련 테스트 코드를 추가/수정하거나 테스트가 필요 없는 이유를 완료 보고에 적어라.
- 파일을 수정했다면 `git diff --check`와 가능한 테스트/검증 명령을 실행해라.
- 테스트 또는 필수 검증이 실패하면 commit과 push를 하지 마라.
- 검증이 통과하면 관련 파일만 stage하고 conventional commit 형식으로 commit한 뒤 현재 branch를 origin에 push해라.
- 답변만 한 경우에는 commit/push를 하지 마라.

완료 보고에 포함할 것:
- 수행한 작업 또는 답변
- 변경한 파일 목록
- 실행한 명령
- 테스트/검증 결과
- commit hash와 push 결과, 또는 commit/push하지 않은 이유
- 남은 질문
"""


@app.event("app_mention")
def handle_app_mention(event, say):
    text = event.get("text", "")
    text = re.sub(r"<@[^>]+>", "", text).strip()
    channel = event["channel"]
    thread_ts = event.get("thread_ts") or event["ts"]

    if not text or text in {"help", "도움말"}:
        say(
            "사용법:\n"
            "`@AI Devbox Bot status`\n"
            "`@AI Devbox Bot issues`\n"
            "`@AI Devbox Bot issue 3 처리해줘`\n"
            "`@AI Devbox Bot 다음에 할 일 추천해줘`\n"
            "`@AI Devbox Bot <질문 또는 작업 지시>`\n"
            "`@AI Devbox Bot reset context`\n"
            "`@AI Devbox Bot stop`\n"
            "`@AI Devbox Bot logs`"
        )
        return

    if text.startswith("status"):
        with active_jobs_lock:
            running_threads = ", ".join(active_jobs.keys()) or "none"
        output = run_shell(
            "echo '[git status]' && "
            "git status --short && "
            "echo '\\n[tmux sessions]' && "
            "tmux ls 2>/dev/null || true"
        )
        say(f"```[active slack jobs]\n{running_threads}\n\n{output}```", thread_ts=thread_ts)
        return

    if text.startswith("issues"):
        output = run_shell("gh issue list --limit 20")
        say(f"```{output}```", thread_ts=thread_ts)
        return

    if text.startswith("logs"):
        output = run_shell(
            "ls -lt .agent/logs 2>/dev/null | head -20 || echo 'no logs yet'"
        )
        say(f"```{output}```", thread_ts=thread_ts)
        return

    if text.startswith("reset context"):
        reset_context(channel, thread_ts)
        say("이 Slack 스레드의 Codex 컨텍스트를 지웠습니다.", thread_ts=thread_ts)
        return

    if text.startswith("stop"):
        with active_jobs_lock:
            process = active_jobs.get(thread_ts)

        if process:
            process.terminate()
            say("이 Slack 스레드의 AI 작업에 중단 신호를 보냈습니다.", thread_ts=thread_ts)
        elif thread_ts in active_jobs:
            say("AI 작업이 시작 준비 중입니다. 잠시 후 다시 `stop`을 보내세요.", thread_ts=thread_ts)
        else:
            output = run_shell(
                f"tmux kill-session -t {SESSION_NAME} 2>/dev/null "
                f"&& echo stopped legacy {SESSION_NAME} "
                f"|| echo no running job for this thread"
            )
            say(f"```{output}```", thread_ts=thread_ts)
        return

    user_prompt = re.sub(r"^ask\s+", "", text, flags=re.IGNORECASE).strip()
    append_context(channel, thread_ts, "User", user_prompt)
    prompt = build_codex_prompt(user_prompt, channel, thread_ts)
    say(start_codex_job(prompt, channel, thread_ts), thread_ts=thread_ts)


if __name__ == "__main__":
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
